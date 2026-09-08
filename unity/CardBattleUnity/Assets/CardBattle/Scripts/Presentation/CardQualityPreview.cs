using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Hundred.CardBattle.Presentation
{
    public sealed class CardQualityPreview : MonoBehaviour
    {
        static CardQualityPreview current;
        public static bool IsOpen => current != null;
        SpiritCardView hero,hand,field;
        CardFaceData data;
        Text zoomValue,focusValue,artInfo,nameLabel;
        Slider zoomControl,xControl,yControl;
        Button goradon,orb;
        Transform page;
        bool ready;
        bool battleMode;
        CardFaceData battleData;
        string imageUrl,battleSummary;
        UnityWebRequest activeImageRequest;
        static readonly Dictionary<string,Texture2D> imageCache=new Dictionary<string,Texture2D>();
        static readonly Queue<string> imageOrder=new Queue<string>();
        public static void OpenBattle(Hundred.CardBattle.SummonPoc.Card card,string origin)
        {
            if(IsOpen)return;
            var root=new GameObject("BattleCardPresentation",typeof(RectTransform));
            current=root.AddComponent<CardQualityPreview>();
            current.battleMode=true;
            current.battleData=new CardFaceData {
                cardId=card.cardId,name=card.name,englishName=card.cardId,tribe=card.family,
                attribute=card.color,cost=card.cost,effectHeading="",effectText=card.effect,flavor="",
                levels=Array.ConvertAll(card.levels,l=>new CardFaceLevel {level=l.level,requiredCores=l.requiredCores,bp=l.bp})
            };
            // A master key is a relative object path, never an arbitrary URL or credential.
            var key=card.illustration==null?"":card.illustration.objectKey;
            if(!string.IsNullOrEmpty(key) && System.Text.RegularExpressions.Regex.IsMatch(key,@"^[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)+$") && !key.Contains(".."))
                current.imageUrl=origin+"/card-art/"+key;
            current.battleSummary="軽減："+FormatColors(card.reductions)+"\nシンボル："+FormatColors(card.symbolDefinitions)+"\n画像は検証用の仮素材";
            current.Build();
        }
        static string FormatColors(Hundred.CardBattle.SummonPoc.ColorCount[] values)
        {
            if(values==null||values.Length==0)return "なし";
            return string.Join(" / ",Array.ConvertAll(values,v=>v.color+" "+v.count));
        }
        public static void Open()
        {
            if(IsOpen)return;
            var root=new GameObject("CardQualityPreview",typeof(RectTransform));current=root.AddComponent<CardQualityPreview>();current.Build();
        }
        void OnDestroy(){if(activeImageRequest!=null)activeImageRequest.Abort();if(current==this)current=null;}
        void Build()
        {
            var canvas=gameObject.AddComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=100;
            var scaler=gameObject.AddComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution=new Vector2(1440,900);scaler.screenMatchMode=CanvasScaler.ScreenMatchMode.Expand;
            gameObject.AddComponent<GraphicRaycaster>();
            if(EventSystem.current==null)
            {
                var events=new GameObject("PreviewEventSystem",typeof(EventSystem),typeof(StandaloneInputModule));events.transform.SetParent(transform,false);
            }
            var bg=CardUi.Box(transform,"Background",0,0,1440,900,CardUi.Hex("101A1D"));
            bg.rectTransform.anchorMin=Vector2.zero;bg.rectTransform.anchorMax=Vector2.one;bg.rectTransform.offsetMin=bg.rectTransform.offsetMax=Vector2.zero;
            var layout=CardUi.Rect(transform,"Page",0,0,1440,900);layout.anchorMin=layout.anchorMax=layout.pivot=new Vector2(.5f,.5f);layout.anchoredPosition=Vector2.zero;page=layout;
            CardUi.Label(page,"Brand","H U N D R E D",48,30,640,36,23,CardUi.Paper,FontStyle.Bold);
            CardUi.Label(page,"Eyebrow","CARD ART STUDY   /   01",49,67,660,25,11,CardUi.Hex("8DA29F"));
            CardUi.Button(page,"Close",battleMode?"カード一覧に戻る":"ロビーに戻る",1208,38,184,44,()=>Destroy(gameObject));
            CardUi.Box(page,"HeaderLine",48,112,1344,1,CardUi.Hex("36423D"));
            CardUi.Box(page,"HeroPanel",72,175,520,628,CardUi.Hex("1A2729"),true);
            goradon=CardUi.Button(page,"Goradon","ゴラドン",92,131,235,42,()=>Select("Goradon"));
            orb=CardUi.Button(page,"WillOrb","ウィル・オーブ",337,131,235,42,()=>Select("WillOrb"));
            hero=CreateCard("Hero",132,206,400,CardDisplaySize.Detail);
            CardUi.Label(page,"DetailCaption","DETAIL  /  拡大表示",93,782,477,31,12,CardUi.Hex("AABCB5"),FontStyle.Normal,TextAnchor.MiddleCenter);
            CardUi.Label(page,"SectionTitle",battleMode?"引いたカードの表示":"カードとしての見え方",648,148,730,47,28,CardUi.Paper,FontStyle.Bold);
            nameLabel=CardUi.Label(page,"Subject","",650,197,720,30,14,CardUi.Hex("AABCB5"));
            CardUi.Box(page,"HandMat",637,243,231,293,CardUi.Hex("1D2B2E"),true);
            CardUi.Box(page,"FieldMat",896,243,240,293,CardUi.Hex("1D2B2E"),true);
            hand=CreateCard("Hand",665,262,174,CardDisplaySize.Hand);
            field=CreateCard("Field",947,292,138,CardDisplaySize.Field);
            CardUi.Label(page,"HandLabel","HAND / 手札",655,542,221,28,12,CardUi.Hex("AABCB5"));
            CardUi.Label(page,"FieldLabel","FIELD / 場",914,542,221,28,12,CardUi.Hex("AABCB5"));
            CardUi.Label(page,"SizeNote",battleMode?battleSummary:"原作の配置を\n3サイズで比較。",1160,326,213,180,15,CardUi.Hex("AABCB5"));
            CardUi.Box(page,"Divider",650,591,718,1,CardUi.Hex("36423D"));
            CardUi.Label(page,"CropTitle","イラストの見せ方",650,609,460,35,19,CardUi.Paper,FontStyle.Bold);
            CardUi.Button(page,"Reset","元の構図",1220,606,147,37,ResetCrop);
            CardUi.Label(page,"ZoomLabel","拡大率",652,660,105,32,14,CardUi.Hex("B7C8C0"));
            zoomControl=CardUi.Slider(page,"Zoom",768,660,457,1,1.6f,_=>UpdateCrop());
            zoomValue=CardUi.Label(page,"ZoomValue","",1244,659,116,32,15,CardUi.Paper,FontStyle.Normal,TextAnchor.MiddleRight);
            CardUi.Label(page,"XLabel","左右の位置",652,709,115,32,14,CardUi.Hex("B7C8C0"));
            xControl=CardUi.Slider(page,"FocusX",768,709,250,0,1,_=>UpdateCrop());
            CardUi.Label(page,"YLabel","上下",1041,709,60,32,14,CardUi.Hex("B7C8C0"));
            yControl=CardUi.Slider(page,"FocusY",1107,709,250,0,1,_=>UpdateCrop());
            focusValue=CardUi.Label(page,"CropHint","拡大すると切り抜き位置の違いを確認できます。",652,753,706,26,12,CardUi.Hex("8DA29F"));
            artInfo=CardUi.Label(page,"ArtInfo","",652,788,706,25,12,CardUi.Hex("8DA29F"));
            CardUi.Box(page,"FooterRule",48,835,1344,1,CardUi.Hex("36423D"));
            CardUi.Label(page,"Footer",battleMode?"対戦は進行中です。これは開いた時点のカード定義です。防御操作は一覧を閉じて盤面へ戻ってください。":"表示専用の試作です。カードの効果は実行せず、対戦データは変更しません。",49,851,1280,29,13,CardUi.Hex("8DA29F"));
            ready=hero!=null&&hand!=null&&field!=null;
            if(battleMode)
            {
                goradon.gameObject.SetActive(false);orb.gameObject.SetActive(false);
                data=battleData;nameLabel.text=data.name+" / "+data.cardId;
                if(ready){hero.Bind(data,null,CardDisplaySize.Detail);hand.Bind(data,null,CardDisplaySize.Hand);field.Bind(data,null,CardDisplaySize.Field);}
                ResetCrop();StartCoroutine(LoadBattleArt());
            }
            else Select("Goradon");
        }
        IEnumerator LoadBattleArt()
        {
            if(string.IsNullOrEmpty(imageUrl)){artInfo.text="画像未登録：カード情報のみ表示します。";yield break;}
            if(imageCache.TryGetValue(imageUrl,out var cached))
            {
                ApplyBattleArt(cached,"メモリキャッシュから表示");yield break;
            }
            artInfo.text="画像を読み込み中…";
            using(var request=UnityWebRequestTexture.GetTexture(imageUrl,true))
            {
                activeImageRequest=request;request.timeout=15;
                yield return request.SendWebRequest();
                activeImageRequest=null;
                if(request.result!=UnityWebRequest.Result.Success)
                {artInfo.text="画像取得失敗（HTTP "+request.responseCode+"）。一覧に戻り、開き直すと再試行します。";yield break;}
                var texture=DownloadHandlerTexture.GetContent(request);
                if(texture==null){artInfo.text="画像を読み込めませんでした。";yield break;}
                texture.wrapMode=TextureWrapMode.Clamp;texture.filterMode=FilterMode.Bilinear;
                while(imageOrder.Count>=8){var old=imageOrder.Dequeue();Destroy(imageCache[old]);imageCache.Remove(old);}
                imageCache.Add(imageUrl,texture);imageOrder.Enqueue(imageUrl);
                ApplyBattleArt(texture,"HTTPで取得");
            }
        }
        void ApplyBattleArt(Texture2D art,string source)
        {
            if(ready){hero.Bind(data,art,CardDisplaySize.Detail);hand.Bind(data,art,CardDisplaySize.Hand);field.Bind(data,art,CardDisplaySize.Field);UpdateCrop();}
            artInfo.text=source+" / "+art.width+" × "+art.height+" px";
        }
        SpiritCardView CreateCard(string name,float x,float y,float width,CardDisplaySize mode)
        {
            var prefab=Resources.Load<GameObject>("CardQuality/SpiritCardContourV5");
            if(prefab==null)
            {
                CardUi.Label(page,name+"Error","カードPrefabが見つかりません。\n再ビルドしてください。",x,y,width,170,18,CardUi.Paper);return null;
            }
            var obj=Instantiate(prefab,page,false);obj.name=name;
            var r=obj.GetComponent<RectTransform>();r.anchoredPosition=new Vector2(x,-y);r.localScale=Vector3.one*(width/400f);
            return obj.GetComponent<SpiritCardView>();
        }
        void Select(string fixture)
        {
            var json=Resources.Load<TextAsset>("CardQuality/"+fixture);
            if(json==null){nameLabel.text="表示データが見つかりません。";return;}
            data=JsonUtility.FromJson<CardFaceData>(json.text);
            var art=Resources.Load<Texture2D>(data.imageResource);
            nameLabel.text=data.englishName+"  /  "+data.name;
            artInfo.text=art==null ? "画像を読み込めませんでした。" : "画像 "+art.width+" × "+art.height+" px  /  枠・文字はUnityで合成";
            if(ready)
            {
                hero.Bind(data,art,CardDisplaySize.Detail);hand.Bind(data,art,CardDisplaySize.Hand);field.Bind(data,art,CardDisplaySize.Field);
            }
            goradon.interactable=fixture!="Goradon";orb.interactable=fixture!="WillOrb";
            ResetCrop();
        }
        void ResetCrop()
        {
            if(data==null)return;
            zoomControl.SetValueWithoutNotify(data.zoom);xControl.SetValueWithoutNotify(data.focalX);yControl.SetValueWithoutNotify(data.focalY);UpdateCrop();
        }
        void UpdateCrop()
        {
            if(data==null)return;
            if(ready){hero.SetCrop(zoomControl.value,xControl.value,yControl.value);hand.SetCrop(zoomControl.value,xControl.value,yControl.value);field.SetCrop(zoomControl.value,xControl.value,yControl.value);}
            zoomValue.text=zoomControl.value.ToString("0.00")+" ×";
            focusValue.text="中心位置：左右 "+Mathf.RoundToInt(xControl.value*100)+"% / 上下 "+Mathf.RoundToInt(yControl.value*100)+"%（拡大すると違いを確認できます）";
        }
    }
}
