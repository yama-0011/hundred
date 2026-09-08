using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

sealed record ColorCount(string Color, int Count);
sealed record IllustrationRef(string ObjectKey, int Version);
sealed record CardDefinition(string CardId, string Name, string CardType, string Color, string Tribe,
    int Cost, ColorCount[] Reductions, ColorCount[] Symbols, CardLevel[] Levels,
    string EffectText, JsonElement[] Effects, IllustrationRef Illustration);
sealed record MasterDefinition(int SchemaVersion, string MasterVersion, string RulesVersion, CardDefinition[] Cards);
sealed record DeckEntry(string CardId, int Count);
sealed record DeckDefinition(string DeckId, string Name, string MasterVersion, DeckEntry[] Cards);
sealed record HomeBundle(DeckDefinition Deck, string MasterJson, string MasterSha256);
sealed record LoadedDeck(DeckDefinition Deck, MasterDefinition Master, string Hash, CardDefinition[] Cards);
sealed class HomeDataException(string code) : Exception(code);

// Only this server-side client receives the shared key. Unity sends a deck ID, never definitions.
sealed class HomeCatalog
{
    readonly HttpClient client;
    readonly string key;
    static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow
    };
    static readonly HashSet<string> Colors = ["RED", "PURPLE", "GREEN", "WHITE", "YELLOW", "BLUE"];
    public HomeCatalog(IConfiguration config, string contentRoot)
    {
        key = config["HomeApi:Key"] ?? "";
        var keyFile = Path.GetFullPath(Path.Combine(contentRoot, "../workers/card-home-poc/.dev.vars"));
        if (key.Length == 0 && File.Exists(keyFile))
        {
            var match = Regex.Match(File.ReadAllText(keyFile), @"(?m)^BATTLE_SHARED_KEY=([a-f0-9]{64})\r?$");
            if (match.Success) key = match.Groups[1].Value;
        }
        var uri = new Uri((config["HomeApi:BaseUrl"] ?? "http://127.0.0.1:8788").TrimEnd('/') + "/");
        if (uri.Scheme != "https" && !(uri.Scheme == "http" && uri.IsLoopback))
            throw new InvalidOperationException("HomeApi requires HTTPS or loopback HTTP.");
        client = new HttpClient { BaseAddress = uri, Timeout = TimeSpan.FromSeconds(8), MaxResponseContentBufferSize = 4 * 1024 * 1024 };
    }
    public async Task<LoadedDeck> LoadAsync(string? requestedId)
    {
        if (string.IsNullOrEmpty(key)) throw new HomeDataException("home_not_configured");
        string id = string.IsNullOrWhiteSpace(requestedId) ? "deck-poc" : requestedId.Trim();
        Require(Regex.IsMatch(id, @"^[A-Za-z0-9_-]{1,80}$"), "invalid_deck_id");
        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, "internal/decks/" + Uri.EscapeDataString(id));
            request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", key);
            using var response = await client.SendAsync(request);
            if (response.StatusCode == HttpStatusCode.NotFound) throw new HomeDataException("deck_not_found");
            if (response.StatusCode == HttpStatusCode.Unauthorized) throw new HomeDataException("home_auth_failed");
            if (!response.IsSuccessStatusCode) throw new HomeDataException("home_data_error");
            var bundle = JsonSerializer.Deserialize<HomeBundle>(await response.Content.ReadAsStringAsync(), JsonOptions);
            Require(bundle is not null && bundle.Deck is not null && bundle.MasterJson is not null, "invalid_home_data");
            var valid = bundle!;
            var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(valid.MasterJson))).ToLowerInvariant();
            Require(hash == valid.MasterSha256, "master_hash_mismatch");
            var master = JsonSerializer.Deserialize<MasterDefinition>(valid.MasterJson, JsonOptions);
            Require(master is not null, "invalid_master");
            ValidateMaster(master!);
            var deck = valid.Deck;
            Require(deck.DeckId == id && deck.MasterVersion == master!.MasterVersion && !string.IsNullOrWhiteSpace(deck.Name), "invalid_deck");
            Require(deck.Cards is { Length: > 0 and <= 40 }, "invalid_deck");
            var definitions = master.Cards.ToDictionary(c => c.CardId, StringComparer.Ordinal);
            var seen = new HashSet<string>();
            var names = new Dictionary<string, int>();
            var expanded = new List<CardDefinition>();
            foreach (var entry in deck.Cards)
            {
                Require(entry is not null && entry.CardId is not null && entry.Count is >= 1 and <= 3, "invalid_deck");
                Require(seen.Add(entry!.CardId) && definitions.ContainsKey(entry.CardId), "invalid_deck");
                var card = definitions[entry.CardId];
                names.TryGetValue(card.Name, out int count);
                Require(count + entry.Count <= 3, "same_name_limit");
                names[card.Name] = count + entry.Count;
                for (int i = 0; i < entry.Count; i++) expanded.Add(card);
            }
            Require(expanded.Count == 40, "deck_must_have_40_cards");
            return new LoadedDeck(deck, master, hash, expanded.ToArray());
        }
        catch (HttpRequestException) { throw new HomeDataException("home_unavailable"); }
        catch (TaskCanceledException) { throw new HomeDataException("home_unavailable"); }
        catch (JsonException) { throw new HomeDataException("invalid_home_data"); }
    }
    static void ValidateMaster(MasterDefinition m)
    {
        Require(m.SchemaVersion == 1 && m.RulesVersion == "core-1" && !string.IsNullOrWhiteSpace(m.MasterVersion), "unsupported_master_version");
        Require(m.Cards is { Length: > 0 and <= 1000 }, "invalid_master");
        var ids = new HashSet<string>();
        foreach (var c in m.Cards)
        {
            Require(c is not null && !string.IsNullOrWhiteSpace(c.CardId) && ids.Add(c.CardId) && !string.IsNullOrWhiteSpace(c.Name), "invalid_master");
            Require(c!.CardType == "SPIRIT" && Colors.Contains(c.Color) && c.Cost is >= 0 and <= 99 && c.Tribe is not null, "unsupported_card");
            Require(c.Effects is { Length: 0 } && c.EffectText == "効果なし", "unsupported_effect");
            Require(c.Levels is { Length: >= 1 and <= 3 }, "invalid_levels");
            int previous = 0, level = 0;
            foreach (var l in c.Levels)
            {
                Require(l is not null && l.level == ++level && l.requiredCores > previous && l.requiredCores <= 99 && l.bp is >= 0 and <= 999999, "invalid_levels");
                previous = l!.requiredCores;
            }
            Require(c.Levels[0].requiredCores == 1, "unsupported_minimum_core");
            ValidateSymbols(c.Reductions, false);
            ValidateSymbols(c.Symbols, true);
            Require(c.Illustration is not null && c.Illustration.ObjectKey is not null && c.Illustration.Version >= 0, "invalid_illustration");
        }
    }
    static void ValidateSymbols(ColorCount[]? symbols, bool required)
    {
        Require(symbols is not null && symbols.Length <= 6 && (!required || symbols.Length > 0), "invalid_symbols");
        var seen = new HashSet<string>();
        foreach (var s in symbols!) Require(s is not null && Colors.Contains(s.Color) && seen.Add(s.Color) && s.Count >= (required ? 1 : 0) && s.Count <= 9, "invalid_symbols");
    }
    static void Require([System.Diagnostics.CodeAnalysis.DoesNotReturnIf(false)] bool condition, string code)
    {
        if (!condition) throw new HomeDataException(code);
    }
}
