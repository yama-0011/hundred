using System.Security.Cryptography;
using System.Text.Json.Serialization;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.StaticFiles;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(builder.Configuration["urls"] ?? "http://127.0.0.1:5080");
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow);
var app = builder.Build();
var home = new HomeCatalog(builder.Configuration, app.Environment.ContentRootPath);
// Local substitute for object storage/CDN. Only public illustration files live here.
var artRoot = Path.Combine(app.Environment.ContentRootPath, "card-art");
if (Directory.Exists(artRoot))
{
    app.UseStaticFiles(new StaticFileOptions {
        FileProvider = new PhysicalFileProvider(artRoot), RequestPath = "/card-art",
        OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "public,max-age=31536000,immutable"
    });
}
var webRoot = Path.GetFullPath(Path.Combine(app.Environment.ContentRootPath, "../unity/CardBattleUnity/Builds/WebGL"));
if (Directory.Exists(webRoot))
{
    var provider = new PhysicalFileProvider(webRoot);
    var types = new FileExtensionContentTypeProvider();
    types.Mappings[".data"] = "application/octet-stream";
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider, ContentTypeProvider = types,
        OnPrepareResponse = context => context.Context.Response.Headers.CacheControl = "no-cache" });
}
app.Use(async (context, next) =>
{
    if (context.Request.Path.StartsWithSegments("/api")) context.Response.Headers.CacheControl = "no-store";
    await next(context);
});
// A single gate makes seat allocation and actions atomic in this small local PoC.
var gate = new object();
var rooms = new Dictionary<string, Room>();
var sessions = new Dictionary<string, (Room Room, int Seat)>();
app.MapGet("/health", () => Results.Ok(new { status = "ok", scope = "combat-poc" }));
app.MapPost("/api/rooms", async Task<IResult> (CreateRoom command) =>
{
    LoadedDeck deck;
    try { deck = await home.LoadAsync(command.DeckId); }
    catch (HomeDataException ex) { return Results.Json(new { error = ex.Message }, statusCode: 503); }
    lock (gate)
    {
        if (rooms.Count >= 100) return Results.Json(new { error = "room_limit" }, statusCode: 503);
        string code;
        do { code = Convert.ToHexString(RandomNumberGenerator.GetBytes(4)); } while (rooms.ContainsKey(code));
        var room = new Room(code, deck);
        rooms.Add(code, room);
        var token = NewToken(room, 0);
        return Results.Ok(new { token, state = room.Snapshot(0) });
    }
});
app.MapPost("/api/rooms/join", async Task<IResult> (Join command) =>
{
    // Fetch outside the game lock; membership and version are rechecked after the await.
    var requestedCode = command.RoomCode?.Trim().ToUpperInvariant();
    lock (gate)
    {
        if (requestedCode is null || !rooms.TryGetValue(requestedCode, out var candidate))
            return Results.Json(new { error = "room_not_found" }, statusCode: 404);
        if (candidate.Joined) return Results.Json(new { error = "room_full" }, statusCode: 409);
    }
    LoadedDeck deck;
    try { deck = await home.LoadAsync(command.DeckId); }
    catch (HomeDataException ex) { return Results.Json(new { error = ex.Message }, statusCode: 503); }
    lock (gate)
    {
        var code = command.RoomCode?.Trim().ToUpperInvariant();
        if (code is null || !rooms.TryGetValue(code, out var room))
            return Results.Json(new { error = "room_not_found" }, statusCode: 404);
        if (room.Joined) return Results.Json(new { error = "room_full" }, statusCode: 409);
        if (deck.Master.MasterVersion != room.MasterVersion || deck.Hash != room.MasterHash)
            return Results.Json(new { error = "master_version_mismatch" }, statusCode: 409);
        room.Players[1] = new Player("B", deck);
        room.Joined = true;
        room.Phase = "START";
        room.Version++;
        var token = NewToken(room, 1);
        return Results.Ok(new { token, state = room.Snapshot(1) });
    }
});
app.MapGet("/api/game", (HttpRequest request) =>
{
    lock (gate)
    {
        if (!TrySession(request, out var session)) return Results.Unauthorized();
        return Results.Ok(new { state = session.Room.Snapshot(session.Seat) });
    }
});
app.MapPost("/api/game/summon", (HttpRequest request, Summon command) => Execute(request, command.RequestId, command.ExpectedVersion, command, (room, seat) =>
{
    if (room.Phase != "MAIN") return "not_main_step";
    var player = room.Players[seat];
    var card = player.Hand.Find(c => c.InstanceId == command.CardInstanceId);
    if (card is null) return "card_not_in_hand";
    if (player.Field.Count >= 6) return "field_full";
    int payment = player.SummonCost(card);
    if (command.CoreCount < 1) return "insufficient_cores";
    // Legacy requests use reserve only. New requests explicitly select a total pool
    // that supplies both the payment and the new spirit's cores.
    var sources = command.Sources ?? [new CoreSource("", (long)payment + command.CoreCount)];
    var seen = new HashSet<string>();
    var deductions = new List<(Card? Card, int Count)>();
    long total = 0;
    foreach (var source in sources)
    {
        if (source is null || source.Count <= 0 || source.Count > int.MaxValue) return "invalid_core_source";
        string id = source.CardInstanceId ?? "";
        if (!seen.Add(id)) return "invalid_core_source";
        var fieldCard = player.Field.Find(c => c.InstanceId == id);
        if (id.Length != 0 && fieldCard is null) return "card_not_on_field";
        int available = fieldCard is null ? player.Reserve : fieldCard.Cores - 1;
        if (source.Count > available) return fieldCard is null ? "insufficient_cores" : "minimum_core_required";
        total += source.Count;
        deductions.Add((fieldCard, (int)source.Count));
    }
    if (total != (long)payment + command.CoreCount) return "core_total_mismatch";
    // All validation is complete. No rejected summon can consume cores or cards.
    foreach (var deduction in deductions)
    {
        if (deduction.Card is null) player.Reserve -= deduction.Count;
        else deduction.Card.Cores -= deduction.Count;
    }
    player.TrashCores += payment;
    card.Cores = command.CoreCount;
    player.Hand.Remove(card);
    player.Field.Add(card);
    return null;
}));
// Empty endpoint id means reserve. Validate the whole transfer before changing either end.
app.MapPost("/api/game/move-core", (HttpRequest request, MoveCore command) => Execute(request, command.RequestId, command.ExpectedVersion, command, (room, seat) =>
{
    if (room.Phase != "MAIN") return "not_main_step";
    if (command.Count <= 0 || command.FromId == command.ToId) return "invalid_core_move";
    var player = room.Players[seat];
    var source = player.Field.Find(c => c.InstanceId == command.FromId);
    var target = player.Field.Find(c => c.InstanceId == command.ToId);
    if ((!string.IsNullOrEmpty(command.FromId) && source is null) ||
        (!string.IsNullOrEmpty(command.ToId) && target is null)) return "card_not_on_field";
    if (source is null && target is null) return "invalid_core_move";
    int available = source is null ? player.Reserve : source.Cores - 1;
    if (command.Count > available) return source is null ? "insufficient_cores" : "minimum_core_required";
    if (source is null) player.Reserve -= command.Count;
    else source.Cores -= command.Count;
    if (target is null) player.Reserve += command.Count;
    else target.Cores += command.Count;
    return null;
}));
app.MapPost("/api/game/next-step", (HttpRequest request, NextStep command) => Execute(request, command.RequestId, command.ExpectedVersion, command, (room, seat) =>
{
    if (room.WaitingForDefense) return "battle_in_progress";
    room.Advance();
    return null;
}));
app.MapPost("/api/game/attack", (HttpRequest request, Attack command) => Execute(request, command.RequestId, command.ExpectedVersion, command, (room, seat) =>
{
    if (room.Phase != "ATTACK" || room.Turn == 1) return "not_attack_step";
    if (room.WaitingForDefense) return "battle_in_progress";
    var attacker = room.Players[seat].Field.Find(c => c.InstanceId == command.CardInstanceId);
    if (attacker is null) return "card_not_on_field";
    if (attacker.Exhausted) return "card_exhausted";
    attacker.Exhausted = true;
    room.AttackerId = attacker.InstanceId;
    room.BattleId = command.RequestId;
    room.BattleMessage = $"Player {seat + 1} の{attacker.Name}がアタック。防御側の選択待ちです。";
    return null;
}));
app.MapPost("/api/game/defend", (HttpRequest request, Defend command) => Execute(request, command.RequestId, command.ExpectedVersion, command, (room, seat) =>
{
    if (room.Phase != "ATTACK" || !room.WaitingForDefense) return "no_battle";
    if (command.BattleId != room.BattleId) return "stale_battle";
    var attackingPlayer = room.Players[room.ActiveSeat];
    var defendingPlayer = room.Players[seat];
    var attacker = attackingPlayer.Field.Find(c => c.InstanceId == room.AttackerId);
    if (attacker is null) return "card_not_on_field";
    if (command.TakeLife)
    {
        if (!string.IsNullOrEmpty(command.CardInstanceId)) return "invalid_defense";
        var damage = Math.Min(attacker.Symbols, defendingPlayer.Life);
        defendingPlayer.Life -= damage;
        defendingPlayer.Reserve += damage;
        room.BattleMessage = $"Player {seat + 1} がライフで受けました。ライフ -{damage}、リザーブ +{damage}。";
        if (defendingPlayer.Life == 0) room.Winner = room.ActiveSeat + 1;
    }
    else
    {
        var blocker = defendingPlayer.Field.Find(c => c.InstanceId == command.CardInstanceId);
        if (blocker is null) return "card_not_on_field";
        if (blocker.Exhausted) return "card_exhausted";
        // Capture both BP values before applying simultaneous destruction.
        int attackBp = attacker.Bp, blockBp = blocker.Bp;
        blocker.Exhausted = true;
        if (attackBp <= blockBp) attackingPlayer.Destroy(attacker);
        if (blockBp <= attackBp) defendingPlayer.Destroy(blocker);
        room.BattleMessage = attackBp == blockBp ? $"BP {attackBp}で同値。両方のスピリットを破壊しました。" : $"BP {attackBp} 対 {blockBp}。BPが低いスピリットを破壊しました。";
    }
    room.AttackerId = null;
    room.BattleId = "";
    return null;
}, defense: true));
IResult Execute(HttpRequest request, string requestId, int expectedVersion, object command, Func<Room, int, string?> action, bool defense = false)
{
    lock (gate)
    {
        if (!TrySession(request, out var session)) return Results.Unauthorized();
        var (room, seat) = session;
        var player = room.Players[seat];
        IResult Reject(string code) => Results.Json(new { error = code, state = room.Snapshot(seat) }, statusCode: 409);
        if (!Guid.TryParse(requestId, out _)) return Reject("invalid_request_id");
        var signature = command.GetType().Name + ":" + System.Text.Json.JsonSerializer.Serialize(command, command.GetType());
        if (player.Accepted.TryGetValue(requestId, out var accepted))
            return accepted == signature ? Results.Ok(new { state = room.Snapshot(seat), replayed = true }) : Reject("request_id_reused");
        if (!room.Joined) return Reject("waiting_for_opponent");
        if (expectedVersion != room.Version) return Reject("stale_version");
        if (room.Winner != 0) return Reject("game_finished");
        if (room.Paused) return Reject("deck_exhausted");
        if (defense ? room.ActiveSeat == seat : room.ActiveSeat != seat) return Reject(defense ? "not_defender" : "not_your_turn");
        var error = action(room, seat);
        if (error is not null) return Reject(error);
        player.Accepted.Add(requestId, signature);
        player.LastRequestId = requestId;
        room.Version++;
        return Results.Ok(new { state = room.Snapshot(seat), replayed = false });
    }
}
app.Run();
string NewToken(Room room, int seat)
{
    var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32));
    sessions.Add(token, (room, seat));
    return token;
}
bool TrySession(HttpRequest request, out (Room Room, int Seat) session)
{
    var header = request.Headers.Authorization.ToString();
    session = default;
    return header.StartsWith("Bearer ", StringComparison.Ordinal) && sessions.TryGetValue(header[7..], out session);
}
record CreateRoom(string? DeckId);
record Join(string? RoomCode, string? DeckId);
record CoreSource(string? CardInstanceId, long Count);
record Summon(string RequestId, int ExpectedVersion, string CardInstanceId, int CoreCount, CoreSource[]? Sources = null);
record MoveCore(string RequestId, int ExpectedVersion, string? FromId, string? ToId, int Count);
record NextStep(string RequestId, int ExpectedVersion);
record Attack(string RequestId, int ExpectedVersion, string CardInstanceId);
record Defend(string RequestId, int ExpectedVersion, string BattleId, bool TakeLife, string? CardInstanceId);
sealed class Room(string code, LoadedDeck initialDeck)
{
    public int Version, ActiveSeat, Winner;
    public string? AttackerId;
    public string BattleId = "", BattleMessage = "";
    public bool WaitingForDefense => AttackerId is not null;
    public int Turn = 1;
    public bool Joined, Paused;
    public string Phase = "WAITING";
    public string MasterVersion { get; } = initialDeck.Master.MasterVersion;
    public string MasterHash { get; } = initialDeck.Hash;
    public string RulesVersion { get; } = initialDeck.Master.RulesVersion;
    public Player[] Players { get; } = [new("A", initialDeck), new("B", null)];
    // Entering a step applies its automatic effect once, inside the action lock.
    public void Advance()
    {
        Phase = Phase switch
        {
            "START" => Turn == 1 ? "DRAW" : "CORE",
            "CORE" => "DRAW",
            "DRAW" => "REFRESH",
            "REFRESH" => "MAIN",
            "MAIN" => Turn == 1 ? "END" : "ATTACK",
            "ATTACK" => "END",
            "END" => "START",
            _ => throw new InvalidOperationException("Unknown phase")
        };
        BattleMessage = "";
        if (Phase == "START") { ActiveSeat = 1 - ActiveSeat; Turn++; }
        var player = Players[ActiveSeat];
        if (Phase == "CORE") player.Reserve++;
        if (Phase == "DRAW")
        {
            if (player.Deck.Count == 0) Paused = true; // Defeat timing remains an explicit undecided rule.
            else { player.Hand.Add(player.Deck[0]); player.Deck.RemoveAt(0); }
        }
        if (Phase == "REFRESH")
        {
            player.Reserve += player.TrashCores;
            player.TrashCores = 0;
            foreach (var card in player.Field) card.Exhausted = false;
        }
    }
    public object Snapshot(int seat) => new
    {
        roomCode = code, masterVersion = MasterVersion, masterHash = MasterHash, rulesVersion = RulesVersion, version = Version, playerNumber = seat + 1, ready = Joined, phase = Phase,
        turn = Turn, activePlayer = ActiveSeat + 1, isYourTurn = Joined && !Paused && Winner == 0 && ActiveSeat == seat,
        finished = Winner != 0, winner = Winner, waitingForDefense = WaitingForDefense,
        battleId = BattleId, attackerId = AttackerId ?? "", battleMessage = BattleMessage,
        canAttack = Joined && !Paused && Winner == 0 && ActiveSeat == seat && Phase == "ATTACK" && !WaitingForDefense,
        canDefend = Joined && !Paused && Winner == 0 && ActiveSeat != seat && WaitingForDefense,
        paused = Paused, pauseReason = Paused ? "deck_exhausted" : "", lastRequestId = Players[seat].LastRequestId,
        self = Players[seat].PrivateView(),
        opponent = seat == 0 && !Joined ? null : Players[1 - seat].PublicView()
    };
}
sealed class Player
{
    public string DeckId = "", DeckName = "";
    public int Reserve = 4, TrashCores, Life = 5;
    public string LastRequestId = "";
    public Dictionary<string, string> Accepted { get; } = new();
    public List<Card> Deck { get; } = new();
    public List<Card> Hand { get; } = new();
    public List<Card> Field { get; } = new();
    public List<Card> Trash { get; } = new();
    public void Destroy(Card card)
    {
        Field.Remove(card);
        Reserve += card.Cores;
        card.Cores = 0;
        card.Exhausted = false;
        Trash.Add(card);
    }
    public Player(string prefix, LoadedDeck? loaded)
    {
        if (loaded is null) return;
        DeckId = loaded.Deck.DeckId;
        DeckName = loaded.Deck.Name;
        // Card identity and shuffled order belong to this match, not the saved deck.
        for (int i = 0; i < loaded.Cards.Length; i++) Deck.Add(new Card($"{prefix}-{i + 1}", loaded.Cards[i]));
        for (int i = Deck.Count - 1; i > 0; i--)
        {
            int j = RandomNumberGenerator.GetInt32(i + 1);
            (Deck[i], Deck[j]) = (Deck[j], Deck[i]);
        }
        Hand.AddRange(Deck.GetRange(0, 4));
        Deck.RemoveRange(0, 4);
    }
    public int SummonCost(Card card) => Math.Max(0, card.Cost - card.Definition.Reductions.Sum(reduction =>
        Math.Min(reduction.Count, Field.Sum(c => c.Definition.Symbols.Where(s => s.Color == reduction.Color).Sum(s => s.Count)))));
    public object PublicView() => new { life = Life, trashCount = Trash.Count, trash = Trash.Select(c => c.View()).ToArray(), reserve = Reserve, trashCores = TrashCores, deckCount = Deck.Count, handCount = Hand.Count, field = Field.Select(c => c.View()).ToArray() };
    public object PrivateView() => new { deckId = DeckId, deckName = DeckName, life = Life, trashCount = Trash.Count, trash = Trash.Select(c => c.View()).ToArray(), reserve = Reserve, trashCores = TrashCores, deckCount = Deck.Count, hand = Hand.Select(c => c.View(SummonCost(c))).ToArray(), field = Field.Select(c => c.View()).ToArray() };
}
sealed record CardLevel(int level, int requiredCores, int bp);
sealed class Card(string instanceId, CardDefinition definition)
{
    public CardDefinition Definition { get; } = definition;
    public int Cost => Definition.Cost;
    public string Name => Definition.Name;
    public CardLevel[] Levels => Definition.Levels;
    public int Level => Levels.LastOrDefault(l => Cores >= l.requiredCores)?.level ?? 0;
    public int Bp => Levels.LastOrDefault(l => Cores >= l.requiredCores)?.bp ?? Levels[0].bp;
    public int Symbols => Definition.Symbols.Sum(s => s.Count);
    public string InstanceId { get; } = instanceId;
    public int Cores;
    public bool Exhausted;
    public object View(int? summonCost = null) => new
    {
        instanceId = InstanceId, cardId = Definition.CardId, name = Name, type = Definition.CardType, color = Definition.Color,
        levels = Levels, family = Definition.Tribe, effect = Definition.EffectText, illustration = Definition.Illustration,
        reductions = Definition.Reductions, symbolDefinitions = Definition.Symbols,
        cost = Cost, summonCost = summonCost ?? Cost, reduction = Definition.Reductions.Sum(r => r.Count), cores = Cores,
        level = Level, bp = Bp, symbols = Symbols, exhausted = Exhausted
    };
}
