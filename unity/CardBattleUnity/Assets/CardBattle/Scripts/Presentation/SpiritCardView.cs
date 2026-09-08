using UnityEngine;
using UnityEngine.UI;

namespace Hundred.CardBattle.Presentation
{
    // One reusable card face. Art, frame, theme and information remain separate UI elements.
    public sealed class SpiritCardView : MonoBehaviour
    {
        public RawImage illustration, referenceFrame, watermark, symbolReference;
        public CardFrameGraphic frameContour;
        public Image[] accentSurfaces;
        public Image darkSurface, symbol, costDisc;
        public Text titleText, englishText, costText, tribeText, idText, rulesHeading, rulesText, flavorText;
        public Text[] levelTexts, bpTexts, coreTexts;
        public GameObject[] levelGroups;
        public GameObject detailBody, compactBody;
        public Text compactPrimary, compactSecondary;
        public Text missingArt;
        CardFaceData data;
        void OnEnable() { CardUi.ApplyShapes(transform); }
        public void Bind(CardFaceData value, Texture2D texture, CardDisplaySize size)
        {
            data=value;var theme=CardTheme.For(data.attribute);
            foreach(var surface in accentSurfaces) surface.color=theme.Accent;
            darkSurface.color=theme.Dark;costDisc.color=theme.Dark;symbol.color=theme.Accent;
            titleText.text=data.name;englishText.text=data.englishName;costText.text=data.cost.ToString();
            tribeText.text=data.tribe;idText.text=data.cardId;
            rulesHeading.text=data.effectHeading;
            rulesText.text=data.effectText == "効果なし" ? "" : data.effectText;
            flavorText.text=data.flavor;
            for(int i=0;i<levelTexts.Length;i++)
            {
                levelGroups[i].SetActive(i<data.levels.Length);
                if(i<data.levels.Length)
                {
                    var l=data.levels[i];coreTexts[i].text=l.requiredCores.ToString();levelTexts[i].text="Lv"+l.level;
                    bpTexts[i].text=l.bp.ToString();
                }
            }
            detailBody.SetActive(true);compactBody.SetActive(false);
            var frame=data.attribute=="RED" || data.attribute=="PURPLE" ? Resources.Load<Texture2D>(data.attribute=="PURPLE" ? "CardQuality/Frames/PurpleReference" : "CardQuality/Frames/RedReference") : null;
            referenceFrame.texture=frame;referenceFrame.enabled=false;
            // UVs select the card boundary inside the supplied screenshots. No image is edited.
            referenceFrame.uvRect=data.attribute=="PURPLE" ? new Rect(0,0,1,1) : new Rect(8f/500,10f/713,479f/500,697f/713);
            frameContour.Bind(frame,referenceFrame.uvRect,data.attribute=="PURPLE");
            costDisc.color=Color.black;
            costDisc.rectTransform.anchoredPosition=data.attribute=="PURPLE" ? new Vector2(27,-16) : new Vector2(24,-17);
            costText.rectTransform.anchoredPosition=data.attribute=="PURPLE" ? new Vector2(26,-13) : new Vector2(23,-14);
            watermark.texture=Resources.Load<Texture2D>("CardQuality/Frames/RedReference");
            watermark.uvRect=new Rect(43f/500,40f/713,406f/500,238f/713);
            watermark.enabled=frame!=null && watermark.texture!=null;
            symbolReference.texture=frame;symbolReference.enabled=frame!=null;symbol.gameObject.SetActive(frame==null);
            symbolReference.uvRect=data.attribute=="PURPLE" ? new Rect(391f/481,32f/695,54f/481,63f/695) : new Rect(398f/500,39f/713,57f/500,61f/713);
            // Preserve the source symbol aspect ratio instead of stretching it into a fixed box.
            if(frame!=null)
            {
                var uv=symbolReference.uvRect;
                float aspect=uv.width*frame.width/(uv.height*frame.height);
                symbolReference.rectTransform.sizeDelta=new Vector2(43,43/aspect);
            }
            illustration.texture=texture;illustration.enabled=texture!=null;missingArt.gameObject.SetActive(texture==null);
            SetCrop(data.zoom,data.focalX,data.focalY);
        }
        public void SetCrop(float zoom,float focalX,float focalY)
        {
            if(illustration.texture==null)return;
            float imageAspect=(float)illustration.texture.width/illustration.texture.height;
            float viewportAspect=illustration.rectTransform.rect.width/illustration.rectTransform.rect.height;
            float width=imageAspect>viewportAspect?viewportAspect/imageAspect:1;
            float height=imageAspect>viewportAspect?1:imageAspect/viewportAspect;
            width/=Mathf.Max(1,zoom);height/=Mathf.Max(1,zoom);
            float x=Mathf.Clamp(focalX-width*.5f,0,1-width);
            float y=Mathf.Clamp(1-focalY-height*.5f,0,1-height);
            illustration.uvRect=new Rect(x,y,width,height);
        }
    }
}
