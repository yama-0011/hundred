using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using UnityEngine;
using UnityEngine.Networking;

namespace Hundred.CardBattle
{
    public sealed partial class SummonPoc : MonoBehaviour
    {
        [Serializable] public class CardLevel { public int level, requiredCores, bp; }
        [Serializable] public class ColorCount { public string color; public int count; }
        [Serializable] public class Illustration { public string objectKey; public int version; }
        [Serializable] public class Card { public Illustration illustration; public string instanceId, cardId, name, type, color, family, effect; public int cost, summonCost, reduction, cores, bp, level, symbols; public bool exhausted; public CardLevel[] levels; public ColorCount[] reductions, symbolDefinitions; }
        [Serializable] public class PlayerView { public string deckId, deckName; public int life, reserve, trashCores, handCount, deckCount, trashCount; public Card[] hand, field, trash; }
        [Serializable] public class State { public string roomCode, phase, pauseReason, lastRequestId, masterVersion; public int version, playerNumber, turn, activePlayer; public bool ready, isYourTurn, paused, finished, waitingForDefense, canAttack, canDefend; public int winner; public string battleId, attackerId, battleMessage; public PlayerView self, opponent; }
        [Serializable] public class Envelope { public string token, error; public State state; }
        [Serializable] public class Command { public string requestId, cardInstanceId; public int expectedVersion, coreCount; public CoreSource[] sources; }
        [Serializable] public class CoreSource { public string cardInstanceId; public int count; }
        [Serializable] public class CoreCommand { public string requestId, fromId, toId; public int expectedVersion, count; }
        [Serializable] public class StepCommand { public string requestId; public int expectedVersion; }
        [Serializable] public class AttackCommand { public string requestId, cardInstanceId; public int expectedVersion; }
        [Serializable] public class DefenseCommand { public string requestId, battleId, cardInstanceId; public int expectedVersion; public bool takeLife; }
        [Serializable] public class CreateRoomCommand { public string deckId; }
        [Serializable] public class JoinCommand { public string roomCode, deckId; }
        bool detailsOpen;
        int detailsZone;
        string detailCardId;
        Vector2 detailListScroll;
        readonly string[] detailZones = { "自分の手札", "自分の場", "相手の場", "自分の捨て札", "相手の捨て札" };
        Card summonDraft;
        int draftVersion, draftCores = 1;
        readonly Dictionary<string, int> draftSources = new Dictionary<string, int>();
        Vector2 sourceScroll;
#if UNITY_WEBGL && !UNITY_EDITOR
        [System.Runtime.InteropServices.DllImport("__Internal")]
        private static extern void HundredCopyRoomId(string value, string receiver);
#endif
        public void OnRoomIdCopied(string result)
        {
            message = result == "ok" ? "ルームIDをコピーしました。" : "コピーできませんでした。表示されたルームIDを手入力してください。";
        }
        void CopyRoomId()
        {
#if UNITY_WEBGL && !UNITY_EDITOR
            HundredCopyRoomId(state.roomCode, gameObject.name);
#else
            GUIUtility.systemCopyBuffer = state.roomCode;
            OnRoomIdCopied("ok");
#endif
        }
        State state;
        string deckInput = "deck-poc";
        string token, roomInput = "", message = "片方でルームを作り、もう片方でコードを入力してください。";
        bool busy;
        string selectedId, selectedFieldId, pendingPath, pendingJson, pendingId;
        Vector2 handScroll, ownScroll, opponentScroll;
        float lastSync;
        GUIStyle title, heading, label, small, button, card, input;
        Font font;
        string BaseUrl => Application.platform == RuntimePlatform.WebGLPlayer
            ? new Uri(Application.absoluteURL).GetLeftPart(UriPartial.Authority) : "http://127.0.0.1:5080";
        void Start() { Application.runInBackground = true; StartCoroutine(Poll()); }
        IEnumerator Poll()
        {
            while (true)
            {
                yield return new WaitForSecondsRealtime(.5f);
                if (!busy && state != null) yield return Send("/api/game", null, false, true);
            }
        }
        IEnumerator Send(string path, string json, bool entry = false, bool poll = false)
        {
            busy = true;
            using (var request = new UnityWebRequest(BaseUrl + path, json == null ? "GET" : "POST"))
            {
                request.downloadHandler = new DownloadHandlerBuffer();
                if (json != null) { request.uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(json)); request.SetRequestHeader("Content-Type", "application/json"); }
                if (!entry && !string.IsNullOrEmpty(token)) request.SetRequestHeader("Authorization", "Bearer " + token);
                request.timeout = 8;
                yield return request.SendWebRequest();
                if (request.result == UnityWebRequest.Result.ConnectionError || request.result == UnityWebRequest.Result.DataProcessingError)
                {
                    if (!poll) message = "通信に失敗しました。再試行ボタンで操作結果を確認できます。";
                }
                else
                {
                    Envelope result = null;
                    try { result = JsonUtility.FromJson<Envelope>(request.downloadHandler.text); } catch (Exception) { }
                    bool success = request.responseCode >= 200 && request.responseCode < 300;
                    if (result != null && result.state != null)
                    {
                        bool becameReady = (state == null || !state.ready) && result.state.ready;
                        bool battleChanged = state != null && state.battleMessage != result.state.battleMessage && !string.IsNullOrEmpty(result.state.battleMessage);
                        if (state == null || result.state.version >= state.version) state = result.state;
                        if (poll && battleChanged) message = state.battleMessage;
                        if (poll && becameReady) message = "対戦開始。Player 1からステップを進めてください。";
                        lastSync = Time.realtimeSinceStartup;
                        if (entry) { token = result.token; selectedId = null; selectedFieldId = null; }
                        if (state.lastRequestId == pendingId) ClearPending();
                        if (!poll)
                        {
                            ClearPending();
                            message = success ? (entry ? (state.ready ? "対戦開始。Player 1からステップを進めてください。" : "相手の参加を待っています。ルームコードをもう片方に入力してください。") : (path.EndsWith("next-step") ? "ステップを進めました。" : path.EndsWith("summon") ? "召喚成功。軽減後のコストを支払いました。" : path.EndsWith("move-core") ? "コアを移動しました。レベル・BPを更新しました。" : state.battleMessage)) : ErrorText(result.error);
                        }
                    }
                    else if (!poll) message = ErrorText(result == null ? "" : result.error);
                    else if (request.responseCode == 401) message = "ルーム情報が無効です。ロビーに戻って作り直してください。";
                }
            }
            busy = false;
        }
        string ErrorText(string error)
        {
            switch (error)
            {
                case "home_not_configured": return "ホームの npm run setup を実行し、バトルサーバーを再起動してください。";
                case "home_unavailable": return "ホームに接続できません。127.0.0.1:8788で起動してください。";
                case "home_auth_failed": return "ホームとの認証に失敗しました。設定を確認してバトルサーバーを再起動してください。";
                case "deck_not_found": return "保存デッキが見つかりません。デッキIDを確認してください。";
                case "master_version_mismatch": return "相手とマスタバージョンが異なります。同じバージョンのデッキを選んでください。";
                case "unsupported_effect": return "この検証では効果付きカードを使えません。";
                case "home_data_error": case "invalid_home_data": case "invalid_master": case "master_hash_mismatch": case "unsupported_master_version": return "ホームのマスタを検証できませんでした：" + error;
                case "room_not_found": return "ルームが見つかりません。コードを確認してください。";
                case "room_full": return "このルームは満員です（2人まで）。";
                case "waiting_for_opponent": return "相手の参加を待っています。";
                case "stale_version": return "最新の盤面に更新しました。操作を選び直してください。";
                case "not_your_turn": return "相手のターンです。";
                case "not_main_step": return "召喚・コア移動は自分のメインステップで行えます。";
                case "invalid_core_source": return "コアの供給元を選び直してください。";
                case "core_total_mismatch": return "選択コアの合計を、支払い＋載せるコア数に合わせてください。";
                case "invalid_core_move": return "異なる移動元・移動先と、正のコア数を指定してください。";
                case "minimum_core_required": return "維持コア1個は残してください。コア不足による退場は未対応です。";
                case "field_full": return "スピリットは6体までです。";
                case "insufficient_cores": return "コストと維持に必要なコアが足りません。";
                case "deck_exhausted": return "デッキ切れのため検証停止。勝敗ルールは未確定です。";
                case "not_attack_step": return "攻撃は自分のアタックステップで行えます。";
                case "battle_in_progress": return "防御側の選択を待っています。";
                case "card_not_on_field": return "自分のフィールドからカードを選択してください。";
                case "card_exhausted": return "疲労状態のカードでは攻撃・ブロックできません。";
                case "no_battle": return "現在は防御の選択待ちではありません。";
                case "not_defender": return "防御を選べるのは攻撃を受けたプレイヤーです。";
                case "stale_battle": return "バトルが更新されました。選び直してください。";
                case "invalid_defense": return "ブロックかライフで受けるかを選択してください。";
                case "game_finished": return "対戦は終了しています。";
                case "room_limit": return "ルーム数が上限です。サーバーを再起動してください。";
                default: return "操作を受け付けられませんでした。" + error;
            }
        }
        void InitStyles()
        {
            if (title != null) return;
            font = Resources.Load<Font>("PocJapanese");
            title = Style(27, FontStyle.Bold); heading = Style(20, FontStyle.Bold); label = Style(18); small = Style(15);
            button = new GUIStyle(GUI.skin.button) { font = font, fontSize = 18 };
            card = new GUIStyle(button) { alignment = TextAnchor.MiddleCenter, wordWrap = true, fontSize = 19 };
            input = new GUIStyle(GUI.skin.textField) { font = font, fontSize = 26, alignment = TextAnchor.MiddleLeft };
        }
        GUIStyle Style(int size, FontStyle weight = FontStyle.Normal) => new GUIStyle(GUI.skin.label) { font = font, fontSize = size, fontStyle = weight, wordWrap = true, normal = { textColor = new Color(.88f,.92f,.95f) } };
        void Panel(Rect r, string text)
        {
            var old = GUI.color; GUI.color = new Color(.14f,.21f,.27f); GUI.DrawTexture(r, Texture2D.whiteTexture); GUI.color = old;
            GUI.Label(new Rect(r.x+16,r.y+10,r.width-32,32), text, heading);
        }
        void ClearPending() { pendingPath = null; pendingJson = null; pendingId = null; }
        void Submit(string path, object command, string id)
        {
            pendingPath = path; pendingJson = JsonUtility.ToJson(command); pendingId = id;
            StartCoroutine(Send(path, pendingJson));
        }
        string PhaseName(string phase)
        {
            switch (phase)
            {
                case "START": return "スタート"; case "CORE": return "コア"; case "DRAW": return "ドロー";
                case "REFRESH": return "リフレッシュ"; case "MAIN": return "メイン"; case "ATTACK": return "アタック";
                case "END": return "エンド"; default: return "参加待ち";
            }
        }
        void OnGUI()
        {
            if (Hundred.CardBattle.Presentation.CardQualityPreview.IsOpen) return;
            InitStyles();
            if(state!=null && summonDraft==null && !detailsOpen){DrawArena();return;}
            GUI.matrix = Matrix4x4.Scale(new Vector3(Screen.width / 1200f, Screen.height / 760f, 1));
            GUI.Label(new Rect(32,18,650,40), "HUNDRED / CARD BATTLE", title);
            if (state == null) { Lobby(); return; }
            if (summonDraft != null) { DrawSummonPlan(); return; }
            if (detailsOpen) { DrawCardDetails(); return; }
            if (GUI.Button(new Rect(480,20,190,34), "カード一覧・詳細", button))
            {
                detailsOpen = true;
                detailCardId = null;
                detailListScroll = Vector2.zero;
                return;
            }
            GUI.Label(new Rect(690,20,480,40), state.finished ? (state.winner == state.playerNumber ? "あなたの勝利！" : "あなたの敗北") : state.ready ? "Turn " + state.turn + " / Player " + state.activePlayer + " / " + PhaseName(state.phase) : "相手の参加待ち", heading);
            GUI.Label(new Rect(34,60,200,32), "ルーム " + state.roomCode, heading);
            if (GUI.Button(new Rect(240,58,90,32), "コピー", button)) CopyRoomId();
            GUI.Label(new Rect(344,60,548,40), "Player " + state.playerNumber + " / " + (state.finished ? "対戦終了" : state.canDefend ? "ブロックまたはライフで受けるを選択" : state.waitingForDefense ? "相手の防御選択待ち" : state.ready ? (state.isYourTurn ? "あなたの手番" : "相手の手番") : "1 / 2人"), heading);
            GUI.Label(new Rect(904,60,264,40), (Time.realtimeSinceStartup-lastSync < 3 ? "同期中 / " : "通信待ち / ") + state.masterVersion, small);
            Panel(new Rect(32,106,1136,170), "相手の盤面");
            if (!state.ready) GUI.Label(new Rect(54,163,950,60), "もう片方のブラウザでルームコードを入力してください。", label);
            else
            {
                var opponent = state.opponent;
                GUI.Label(new Rect(54,151,330,120), "ライフ " + opponent.life + " / リザーブ " + opponent.reserve + "\n使用コア " + opponent.trashCores + " / 捨て札 " + opponent.trashCount + "枚\n手札 " + opponent.handCount + "枚（非公開）\nデッキ " + opponent.deckCount + "枚", small);
                DrawField(new Rect(404,150,744,112), opponent.field, ref opponentScroll);
            }
            Panel(new Rect(32,292,170,100), "ライフ");
            Panel(new Rect(32,406,170,108), "リザーブ");
            Panel(new Rect(218,292,570,222), "自分のフィールド");
            Panel(new Rect(804,292,160,222), "ステップ");
            string[] phases = { "START", "CORE", "DRAW", "REFRESH", "MAIN", "ATTACK", "END" };
            for (int i = 0; i < phases.Length; i++)
                GUI.Label(new Rect(815,330 + i * 24,145,25), (state.phase == phases[i] ? "▶ " : "   ") + PhaseName(phases[i]), small);
            Panel(new Rect(980,292,188,86), "デッキ");
            GUI.Label(new Rect(996,331,156,35), state.self.deckCount + " 枚", label);
            Panel(new Rect(980,392,188,122), "トラッシュ");
            var self = state.self;
            GUI.Label(new Rect(48,337,140,50), self.life + " 個", title);
            GUI.Label(new Rect(48,452,140,50), self.reserve + " 個", title);
            GUI.Label(new Rect(996,437,160,70), "捨て札 " + self.trashCount + "枚\n使用コア " + self.trashCores + "個", label);
            bool coreEditing = state.isYourTurn && state.phase == "MAIN";
            DrawField(new Rect(232,336,540,coreEditing ? 114 : 164), self.field, ref ownScroll, state.canAttack || state.canDefend || coreEditing);
            if (coreEditing)
            {
                Card coreTarget = Array.Find(self.field, c => c.instanceId == selectedFieldId);
                GUI.Label(new Rect(234,455,240,48), coreTarget == null ? "場のカードを選びコア移動" : coreTarget.name + " / Lv" + coreTarget.level, small);
                GUI.enabled = !busy && pendingId == null && coreTarget != null && self.reserve > 0;
                if (GUI.Button(new Rect(482,458,134,38), "コア +1", button)) MoveCore("", coreTarget.instanceId);
                GUI.enabled = !busy && pendingId == null && coreTarget != null && coreTarget.cores > 1;
                if (GUI.Button(new Rect(626,458,134,38), "コア −1", button)) MoveCore(coreTarget.instanceId, "");
                GUI.enabled = true;
            }
            Panel(new Rect(32,530,1136,132), "自分の手札（" + self.hand.Length + "枚）");
            handScroll = GUI.BeginScrollView(new Rect(48,571,728,80), handScroll, new Rect(0,0,Mathf.Max(708,self.hand.Length * 184),60));
            Card selected = null;
            for (int i = 0; i < self.hand.Length; i++)
            {
                var c = self.hand[i];
                if (c.instanceId == selectedId) selected = c;
                GUI.enabled = !busy && pendingId == null && state.isYourTurn && state.phase == "MAIN";
                if (GUI.Button(new Rect(i * 184,0,176,58), (c.instanceId == selectedId ? "✓ " : "") + c.name + "\n支払" + c.summonCost + " / BP" + c.bp, button)) { selectedId = c.instanceId; selected = c; }
            }
            GUI.enabled = true;
            GUI.EndScrollView();
            Card fighter = Array.Find(self.field, c => c.instanceId == selectedFieldId);
            if (state.phase == "ATTACK" && !state.finished)
            {
                GUI.Label(new Rect(802,568,348,36), fighter == null ? "自分の回復スピリットを選択" : fighter.name + " / BP" + fighter.bp, small);
                if (state.canDefend)
                {
                    GUI.enabled = !busy && pendingId == null && fighter != null && !fighter.exhausted;
                    if (GUI.Button(new Rect(802,606,166,40), "ブロック", button)) Defend(false, fighter.instanceId);
                    GUI.enabled = !busy && pendingId == null;
                    if (GUI.Button(new Rect(978,606,174,40), "ライフで受ける", button)) Defend(true, "");
                }
                else
                {
                    GUI.enabled = !busy && pendingId == null && state.canAttack && fighter != null && !fighter.exhausted;
                    if (GUI.Button(new Rect(850,606,290,40), state.waitingForDefense ? "相手の防御選択待ち" : "アタックする", button))
                    {
                        string id = Guid.NewGuid().ToString();
                        Submit("/api/game/attack", new AttackCommand { requestId = id, expectedVersion = state.version, cardInstanceId = fighter.instanceId }, id);
                    }
                }
            }
            else
            {
                GUI.Label(new Rect(802,568,340,30), selected == null ? "メインでカードを選択" : selected.name + " / 支払" + selected.summonCost + "＋維持1", small);
                GUI.enabled = !busy && pendingId == null && selected != null && state.isYourTurn && state.phase == "MAIN";
                if (GUI.Button(new Rect(850,606,290,40), "召喚内容を選ぶ", button))
                {
                    summonDraft = selected;
                    draftVersion = state.version;
                    draftCores = 1;
                    draftSources.Clear();
                    draftSources[""] = Math.Min(self.reserve, selected.summonCost + 1);
                    sourceScroll = Vector2.zero;
                }
            }
            GUI.enabled = !busy && pendingId == null && state.isYourTurn && !state.waitingForDefense;
            if (GUI.Button(new Rect(32,680,230,44), state.phase == "END" ? "相手のターンへ" : "次のステップ", button))
            {
                string id = Guid.NewGuid().ToString();
                Submit("/api/game/next-step", new StepCommand { requestId = id, expectedVersion = state.version }, id);
            }
            GUI.enabled = !busy;
            if (pendingId != null && GUI.Button(new Rect(278,680,196,44), "操作を再試行", button)) StartCoroutine(Send(pendingPath, pendingJson));
            if (GUI.Button(new Rect(980,680,188,44), "ロビーへ戻る", button))
            {
                state = null; token = null; ClearPending(); selectedId = null; selectedFieldId = null;
                message = "新しいルームを作成できます。元の席は保持されます。";
            }
            GUI.enabled = true;
            if (state != null)
            {
                string status = state.finished ? "Player " + state.winner + "の勝利。ライフ0で対戦終了です。" : state.paused ? "デッキ切れ：検証停止（勝敗未確定）" : state.waitingForDefense ? state.battleMessage : message;
                GUI.Label(new Rect(pendingId == null ? 280 : 490,678,pendingId == null ? 680 : 475,72), status, small);
            }
        }
        string ColorName(string color)
        {
            switch (color)
            {
                case "RED": return "赤"; case "PURPLE": return "紫"; case "GREEN": return "緑";
                case "WHITE": return "白"; case "YELLOW": return "黄"; case "BLUE": return "青";
                default: return color;
            }
        }
        string ColorCounts(ColorCount[] items)
        {
            if (items == null || items.Length == 0) return "なし";
            return string.Join("・", Array.ConvertAll(items, x => ColorName(x.color) + x.count));
        }
        Card[] DetailCards()
        {
            switch (detailsZone)
            {
                case 0: return state.self.hand ?? new Card[0];
                case 1: return state.self.field ?? new Card[0];
                case 2: return state.opponent == null ? new Card[0] : state.opponent.field ?? new Card[0];
                case 3: return state.self.trash ?? new Card[0];
                default: return state.opponent == null ? new Card[0] : state.opponent.trash ?? new Card[0];
            }
        }
        void DrawCardDetails()
        {
            Panel(new Rect(32,90,1136,590), "カード一覧・詳細");
            for (int i = 0; i < detailZones.Length; i++)
            {
                if (GUI.Button(new Rect(50 + i * 222,140,212,40), (detailsZone == i ? "✓ " : "") + detailZones[i], button))
                {
                    detailsZone = i;
                    detailCardId = null;
                    detailListScroll = Vector2.zero;
                }
            }
            // Resolve against each fresh snapshot so a destroyed or moved card never stays stale.
            Card[] cards = DetailCards();
            Card selected = Array.Find(cards, c => c.instanceId == detailCardId);
            if (selected == null && cards.Length > 0) { selected = cards[0]; detailCardId = selected.instanceId; }
            GUI.Label(new Rect(52,190,340,32), detailZones[detailsZone] + " / " + cards.Length + "枚", heading);
            detailListScroll = GUI.BeginScrollView(new Rect(50,234,355,414), detailListScroll, new Rect(0,0,330,Math.Max(390,cards.Length * 65)));
            for (int i = 0; i < cards.Length; i++)
            {
                var c = cards[i];
                if (GUI.Button(new Rect(0,i * 65,322,58), (detailCardId == c.instanceId ? "✓ " : "") + c.name + "\n" + c.cardId, button)) { detailCardId = c.instanceId; selected = c; }
            }
            GUI.EndScrollView();
            if (selected == null)
            {
                GUI.Label(new Rect(435,240,680,60), "この場所にカードはありません。", heading);
            }
            else
            {
                GUI.Label(new Rect(435,192,690,40), selected.name + " / " + selected.cardId, heading);
                GUI.Label(new Rect(435,239,690,34), "スピリット / " + ColorName(selected.color) + " / 系統：" + selected.family, label);
                GUI.Label(new Rect(435,281,690,34), "コスト " + selected.cost + " / 軽減：" + ColorCounts(selected.reductions) + " / シンボル：" + ColorCounts(selected.symbolDefinitions), label);
                GUI.Label(new Rect(435,323,690,34), detailsZone == 0 ? "現在の召喚支払い：" + selected.summonCost + "個（配置コアは別）" : detailsZone == 1 || detailsZone == 2 ? "現在：コア" + selected.cores + " / Lv" + selected.level + " / BP" + selected.bp + " / " + (selected.exhausted ? "疲労" : "回復") : "捨て札（場でのレベル・疲労状態は適用されません）", label);
                GUI.Label(new Rect(435,370,690,32), "レベル / 必要コア / BP", heading);
                if (selected.levels != null)
                    for (int i = 0; i < selected.levels.Length; i++)
                    {
                        var entry = selected.levels[i];
                        GUI.Label(new Rect(450,411 + i * 38,660,34), "Lv" + entry.level + "    " + entry.requiredCores + "個以上    BP " + entry.bp, label);
                    }
                GUI.Label(new Rect(435,535,690,55), selected.effect, label);
                if (GUI.Button(new Rect(435,655,260,34), "画像付きカードを開く", button))
                    Hundred.CardBattle.Presentation.CardQualityPreview.OpenBattle(selected, BaseUrl);
                GUI.Label(new Rect(435,605,690,35), "Master " + state.masterVersion + " / デッキ：" + state.self.deckName, small);
            }
            GUI.Label(new Rect(34,695,900,50), state.finished ? "対戦終了 / Player " + state.winner + "の勝利" : state.canDefend ? "攻撃を受けています。盤面に戻って防御を選択してください。" : "閲覧中も盤面は自動同期します。相手の手札とデッキ内容は非公開です。", small);
            if (GUI.Button(new Rect(980,695,188,42), "盤面に戻る", button)) detailsOpen = false;
        }
        void DrawSummonPlan()
        {
            Panel(new Rect(100,90,1000,580), "召喚内容の選択 / " + summonDraft.name);
            GUI.Label(new Rect(125,140,945,44), "選んだコアのうち支払い分をトラッシュへ、残りを召喚カードへ載せます。", label);
            GUI.Label(new Rect(125,185,520,36), "軽減後の支払い " + summonDraft.summonCost + "個 / 載せるコア " + draftCores + "個", heading);
            bool editable = !busy && pendingId == null && state.version == draftVersion && state.isYourTurn && state.phase == "MAIN";
            int available = state.self.reserve;
            foreach (var c in state.self.field) available += Math.Max(0, c.cores - 1);
            GUI.enabled = editable && draftCores > 1;
            if (GUI.Button(new Rect(660,184,64,38), "−", button)) draftCores--;
            GUI.enabled = editable && draftCores < available - summonDraft.summonCost;
            if (GUI.Button(new Rect(738,184,64,38), "+", button)) draftCores++;
            GUI.enabled = true;
            CardLevel preview = null;
            if (summonDraft.levels != null)
                foreach (var entry in summonDraft.levels)
                    if (draftCores >= entry.requiredCores) preview = entry;
            GUI.Label(new Rect(825,185,250,38), preview == null ? "レベル情報なし" : "Lv" + preview.level + " / BP" + preview.bp, label);
            GUI.Label(new Rect(125,232,950,36), "供給元ごとに使う数を選択（場のカードには維持コア1個を残します）", small);
            sourceScroll = GUI.BeginScrollView(new Rect(125,276,940,235), sourceScroll, new Rect(0,0,910,Math.Max(220,(state.self.field.Length + 1) * 52)));
            DrawSourceRow("", "リザーブ", state.self.reserve, 0, editable);
            for (int i = 0; i < state.self.field.Length; i++)
            {
                var c = state.self.field[i];
                DrawSourceRow(c.instanceId, c.name + " / 現在コア" + c.cores, Math.Max(0,c.cores - 1), (i + 1) * 52, editable);
            }
            GUI.EndScrollView();
            int total = 0;
            foreach (int count in draftSources.Values) total += count;
            int needed = summonDraft.summonCost + draftCores;
            GUI.Label(new Rect(125,525,945,45), "選択 " + total + "個 / 必要 " + needed + "個（支払い" + summonDraft.summonCost + "＋配置" + draftCores + "）", heading);
            GUI.enabled = editable && total == needed;
            if (GUI.Button(new Rect(720,590,340,48), "この内容で召喚", button))
            {
                var sources = new List<CoreSource>();
                foreach (var source in draftSources)
                    if (source.Value > 0) sources.Add(new CoreSource { cardInstanceId = source.Key, count = source.Value });
                string id = Guid.NewGuid().ToString();
                var command = new Command { requestId = id, expectedVersion = draftVersion, cardInstanceId = summonDraft.instanceId, coreCount = draftCores, sources = sources.ToArray() };
                summonDraft = null;
                Submit("/api/game/summon", command, id);
            }
            GUI.enabled = !busy;
            if (GUI.Button(new Rect(125,590,180,48), "取消", button)) summonDraft = null;
            GUI.enabled = true;
            if (state.version != draftVersion) GUI.Label(new Rect(125,685,950,45), "盤面が更新されました。取消して、最新の盤面から選び直してください。", label);
        }
        void DrawSourceRow(string id, string name, int available, int y, bool editable)
        {
            int count;
            draftSources.TryGetValue(id, out count);
            GUI.Label(new Rect(0,y,535,44), name + " / 使用可能 " + available, label);
            GUI.enabled = editable && count > 0;
            if (GUI.Button(new Rect(550,y,60,40), "−", button)) draftSources[id] = --count;
            GUI.enabled = true;
            GUI.Label(new Rect(635,y,100,40), count + "個", heading);
            GUI.enabled = editable && count < available;
            if (GUI.Button(new Rect(750,y,60,40), "+", button)) draftSources[id] = count + 1;
            GUI.enabled = true;
        }
        void MoveCore(string fromId, string toId)
        {
            string id = Guid.NewGuid().ToString();
            Submit("/api/game/move-core", new CoreCommand { requestId = id, expectedVersion = state.version, fromId = fromId, toId = toId, count = 1 }, id);
        }
        void Defend(bool takeLife, string instanceId)
        {
            string id = Guid.NewGuid().ToString();
            Submit("/api/game/defend", new DefenseCommand { requestId = id, expectedVersion = state.version, battleId = state.battleId, takeLife = takeLife, cardInstanceId = instanceId }, id);
        }
        void DrawField(Rect area, Card[] cards, ref Vector2 scroll, bool selectable = false)
        {
            if (cards.Length == 0) { GUI.Label(area, "カードなし", label); return; }
            scroll = GUI.BeginScrollView(area, scroll, new Rect(0,0,Mathf.Max(area.width-20,cards.Length*234),area.height-20));
            for (int i = 0; i < cards.Length; i++)
            {
                var c = cards[i];
                string text = (c.instanceId == state.attackerId ? "攻撃中 / " : "") + c.name + "\nLv" + c.level + " BP" + c.bp + "\nコア" + c.cores + " / " + (c.exhausted ? "疲労" : "回復");
                var rect = new Rect(i*234,0,226,area.height-24);
                if (selectable)
                {
                    GUI.enabled = !busy && pendingId == null && (!c.exhausted || (state.isYourTurn && state.phase == "MAIN"));
                    if (GUI.Button(rect, (selectedFieldId == c.instanceId ? "✓ " : "") + text, card)) selectedFieldId = c.instanceId;
                    GUI.enabled = true;
                }
                else GUI.Box(rect, text, card);
            }
            GUI.EndScrollView();
        }
        void Lobby()
        {
            if (GUI.Button(new Rect(1030,18,138,36), "カード表示試作", button))
            {
                Hundred.CardBattle.Presentation.CardQualityPreview.Open();
                return;
            }
            GUI.Label(new Rect(34,65,900,32), "2人対戦・アタック／ブロックPoC", heading);
            GUI.Label(new Rect(160,109,130,38), "保存デッキID", label);
            GUI.enabled = !busy;
            deckInput = GUI.TextField(new Rect(300,104,540,44), deckInput, 80, new GUIStyle(input) { fontSize = 18 });
            if (GUI.Button(new Rect(852,104,188,44), "ホームを開く", button)) Application.OpenURL("http://127.0.0.1:8788");
            GUI.Label(new Rect(160,155,880,28), "ホームで保存したIDを指定。初期デッキは deck-poc。対戦開始時に内容を固定します。", small);
            Panel(new Rect(160,185,880,365), "同じルームで接続する");
            GUI.Label(new Rect(192,245,780,52), "最初のブラウザではルームを作成します。", label);
            GUI.enabled = !busy;
            if (GUI.Button(new Rect(192,290,300,62), "ルームを作成", button)) StartCoroutine(Send("/api/rooms", JsonUtility.ToJson(new CreateRoomCommand { deckId = deckInput.Trim() }), true));
            GUI.Label(new Rect(192,378,780,50), "もう片方では、表示された8文字のルームコードを入力します。", label);
            roomInput = GUI.TextField(new Rect(192,437,440,62), roomInput, 8, input).ToUpperInvariant();
            GUI.enabled = !busy && roomInput.Trim().Length == 8;
            if (GUI.Button(new Rect(664,437,300,62), "ルームに参加", button)) StartCoroutine(Send("/api/rooms/join", JsonUtility.ToJson(new JoinCommand { roomCode = roomInput.Trim(), deckId = deckInput.Trim() }), true));
            GUI.enabled = true;
            GUI.Label(new Rect(160,578,880,90), busy ? "接続中…" : message, label);
            GUI.Label(new Rect(160,680,880,55), "同じPCの別タブ・別ウィンドウで確認できます。ページ再読込後は新しいルームを作成してください。", small);
        }
    }
}
