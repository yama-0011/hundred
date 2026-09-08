using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

namespace Hundred.CardBattle.Presentation
{
    public static class CardUi
    {
        static Sprite rounded, circle;
        public static readonly Color Gold = Hex("C4AE79"), Ink = Hex("252421"), Paper = Hex("EEE6D3");
        public static Color Hex(string value) { ColorUtility.TryParseHtmlString("#" + value, out var c); return c; }
        public static RectTransform Rect(Transform parent, string name, float x, float y, float w, float h)
        {
            var r = new GameObject(name, typeof(RectTransform)).GetComponent<RectTransform>();
            r.SetParent(parent, false); r.anchorMin = r.anchorMax = r.pivot = new Vector2(0,1);
            r.anchoredPosition = new Vector2(x,-y); r.sizeDelta = new Vector2(w,h); return r;
        }
        public static Image Box(Transform parent, string name, float x, float y, float w, float h, Color color, bool round = false, bool disc = false)
        {
            var r = Rect(parent, (disc ? "Circle_" : round ? "Round_" : "") + name, x,y,w,h);
            var image = r.gameObject.AddComponent<Image>(); image.color = color; image.raycastTarget = false;
            if (Application.isPlaying) ApplyShape(image);
            return image;
        }
        public static void ApplyShape(Image image)
        {
            if (image.name.StartsWith("Circle_")) { image.sprite = Circle; image.type = Image.Type.Simple; }
            else if (image.name.StartsWith("Round_")) { image.sprite = Rounded; image.type = Image.Type.Sliced; }
        }
        public static void ApplyShapes(Transform root)
        {
            foreach (var image in root.GetComponentsInChildren<Image>(true)) ApplyShape(image);
        }
        static Sprite Rounded => rounded != null ? rounded : rounded = Shape(false);
        static Sprite Circle => circle != null ? circle : circle = Shape(true);
        static Sprite Shape(bool disc)
        {
            const int n = 96;
            var texture = new Texture2D(n,n,TextureFormat.RGBA32,false) { name = disc ? "CardCircle" : "CardRounded", filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var pixels = new Color[n*n];
            for (int y=0;y<n;y++) for (int x=0;x<n;x++)
            {
                float distance;
                if (disc) distance = new Vector2(x+.5f-n*.5f,y+.5f-n*.5f).magnitude-(n*.5f-1);
                else
                {
                    var q = new Vector2(Mathf.Abs(x+.5f-n*.5f),Mathf.Abs(y+.5f-n*.5f))-new Vector2(32,32);
                    distance = new Vector2(Mathf.Max(q.x,0),Mathf.Max(q.y,0)).magnitude+Mathf.Min(Mathf.Max(q.x,q.y),0)-15;
                }
                pixels[y*n+x] = new Color(1,1,1,Mathf.Clamp01(.5f-distance));
            }
            texture.SetPixels(pixels);texture.Apply(false,true);
            return Sprite.Create(texture,new Rect(0,0,n,n),new Vector2(.5f,.5f),100,0,SpriteMeshType.FullRect,disc ? Vector4.zero : new Vector4(18,18,18,18));
        }
        public static Text Label(Transform parent,string name,string text,float x,float y,float w,float h,int size,Color color,FontStyle style=FontStyle.Normal,TextAnchor alignment=TextAnchor.MiddleLeft)
        {
            var label = Rect(parent,name,x,y,w,h).gameObject.AddComponent<Text>();
            label.font = Resources.Load<Font>("PocJapanese"); label.fontSize=size; label.fontStyle=style;
            label.color=color; label.text=text; label.alignment=alignment; label.raycastTarget=false;
            label.horizontalOverflow=HorizontalWrapMode.Wrap;label.verticalOverflow=VerticalWrapMode.Truncate;
            return label;
        }
        public static Button Button(Transform parent,string name,string caption,float x,float y,float w,float h,UnityAction action)
        {
            var bg=Box(parent,name,x,y,w,h,Hex("263438"),true);bg.raycastTarget=true;
            var button=bg.gameObject.AddComponent<Button>();button.targetGraphic=bg;
            var colors=button.colors;colors.normalColor=Color.white;colors.highlightedColor=Hex("D7E6E2");colors.pressedColor=Hex("8CAFAA");colors.disabledColor=new Color(.5f,.5f,.5f,.5f);button.colors=colors;
            Label(bg.transform,"Caption",caption,10,0,w-20,h,16,Hex("E9ECE5"),FontStyle.Normal,TextAnchor.MiddleCenter);
            button.onClick.AddListener(action);return button;
        }
        public static Slider Slider(Transform parent,string name,float x,float y,float w,float min,float max,UnityAction<float> action)
        {
            var root=Rect(parent,name,x,y,w,32);var slider=root.gameObject.AddComponent<Slider>();
            var hit=Box(root,"Hit",0,0,w,32,new Color(0,0,0,0));hit.raycastTarget=true;
            Box(root,"Track",0,14,w,4,Hex("354342"),true);
            var fillArea=Rect(root,"FillArea",0,14,w,4);
            var fill=Box(fillArea,"Fill",0,0,w,4,Gold,true);
            fill.rectTransform.anchorMin=Vector2.zero;fill.rectTransform.anchorMax=Vector2.one;
            fill.rectTransform.offsetMin=fill.rectTransform.offsetMax=Vector2.zero;
            slider.fillRect=fill.rectTransform;
            var handleArea=Rect(root,"HandleArea",9,7,w-18,18);
            var handle=Box(handleArea,"Handle",0,0,18,18,Gold,false,true);handle.raycastTarget=true;
            handle.rectTransform.pivot=new Vector2(.5f,.5f);
            handle.rectTransform.anchorMin=Vector2.zero;handle.rectTransform.anchorMax=new Vector2(0,1);
            handle.rectTransform.anchoredPosition=Vector2.zero;handle.rectTransform.sizeDelta=new Vector2(18,0);
            slider.handleRect=handle.rectTransform;slider.targetGraphic=handle;slider.direction=UnityEngine.UI.Slider.Direction.LeftToRight;
            slider.minValue=min;slider.maxValue=max;slider.onValueChanged.AddListener(action);return slider;
        }
    }
}
