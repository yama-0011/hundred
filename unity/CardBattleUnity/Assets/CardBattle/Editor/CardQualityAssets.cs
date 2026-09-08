using System.IO;
using Hundred.CardBattle.Presentation;
using UnityEditor;
using UnityEngine;
using UnityEngine.UI;

public static class CardQualityAssets
{
    // Separate path preserves the previous study prefab and creates the new layout on rebuild.
    const string Path = "Assets/Resources/CardQuality/SpiritCardContourV5.prefab";
    public static void Ensure()
    {
        if (AssetDatabase.LoadAssetAtPath<GameObject>(Path) == null) CreatePrefab();
    }
    [MenuItem("Card Battle/Card Quality/Rebuild Spirit Card Prefab")]
    public static void CreatePrefab()
    {
        Directory.CreateDirectory("Assets/Resources/CardQuality");
        var root=new GameObject("SpiritCardOriginal",typeof(RectTransform));
        var rect=root.GetComponent<RectTransform>();rect.anchorMin=rect.anchorMax=rect.pivot=new Vector2(0,1);rect.sizeDelta=new Vector2(400,560);
        var view=root.AddComponent<SpiritCardView>();var t=root.transform;
        CardUi.Box(t,"Shadow",2,7,400,560,new Color(0,0,0,.3f),true);
        view.darkSurface=CardUi.Box(t,"FallbackFrame",0,0,400,560,Color.black,true);
        view.referenceFrame=Raw(t,"ReferenceOrnamentalFrame",0,0,400,560);
        // Replace the original art and rules area with independent, data-bound UI.
        CardUi.Box(t,"ArtUnderlay",29,60,342,254,Color.black);
        view.illustration=Raw(t,"Illustration",20,43,360,280);
        view.missingArt=CardUi.Label(t,"MissingArt","イラストを読み込めませんでした",40,156,320,65,18,CardUi.Paper,FontStyle.Normal,TextAnchor.MiddleCenter);
        CardUi.Box(t,"NameBand",29,313,342,29,Color.white);
        CardUi.Box(t,"NameBandShadow",29,340,342,2,CardUi.Hex("BFC0BE"));
        CardUi.Box(t,"BodyPaper",29,342,342,193,Color.white);
        view.watermark=Raw(t,"OriginalPaperAndWatermark",29,342,342,193);
        CardUi.Box(t,"ClearOriginalLevels",29,342,84,157,Color.white);
        CardUi.Box(t,"ClearOriginalFlavor",29,500,291,35,Color.white);
        CardUi.Box(t,"ClearOriginalSymbol",319,484,52,51,Color.white);
        // A mesh opening follows the ornament silhouette instead of four straight strips.
        var frameLayer=CardUi.Rect(t,"ForegroundFrameContour",0,0,400,560);
        view.frameContour=frameLayer.gameObject.AddComponent<CardFrameGraphic>();
        view.frameContour.raycastTarget=false;
        CardUi.Box(t,"TypeBadge",33,321,67,14,CardUi.Hex("828889"));
        var category=CardUi.Label(t,"Category","スピリット",34,319,67,18,10,Color.white,FontStyle.Normal,TextAnchor.MiddleCenter);
        Typeface(category,"BIZUDGothic-Bold",10);
        view.titleText=CardUi.Label(t,"Name","",107,311,202,34,23,Color.black,FontStyle.Bold);
        CardUi.Box(t,"TribeBadge",307,320,61,17,Color.black);
        view.tribeText=CardUi.Label(t,"Tribe","",307,317,61,23,11,Color.white,FontStyle.Bold,TextAnchor.MiddleCenter);
        Typeface(view.titleText,"DelaGothicOne-Regular",21);
        Typeface(view.tribeText,"BIZUDMincho-Regular",12);
        // The ornate rim remains visible; only the baked number and name are covered.
        view.costDisc=CardUi.Box(t,"CostDisc",24,17,38,40,Color.black,false,true);
        view.costText=CardUi.Label(t,"CostText","",23,14,40,44,29,Color.white,FontStyle.Bold,TextAnchor.MiddleCenter);
        CardUi.Box(t,"EnglishPaper",191,25,145,20,CardUi.Hex("FBF7E7"));
        view.englishText=CardUi.Label(t,"EnglishName","",173,12,178,46,23,Color.black,FontStyle.Bold,TextAnchor.MiddleCenter);
        Typeface(view.costText,"Tinos-BoldItalic",35);
        Typeface(view.englishText,"Tinos-Bold",27);
        Stroke(view.englishText,Color.white,.65f);
        view.englishText.verticalOverflow=VerticalWrapMode.Overflow;
        view.englishText.horizontalOverflow=HorizontalWrapMode.Overflow;
        view.detailBody=CardUi.Rect(t,"DetailBody",0,0,400,560).gameObject;
        var dt=view.detailBody.transform;
        view.levelTexts=new Text[3];view.coreTexts=new Text[3];view.bpTexts=new Text[3];view.levelGroups=new GameObject[3];
        var colors=new[]{CardUi.Hex("268BC5"),CardUi.Hex("D8A418"),CardUi.Hex("7CA031")};
        for(int i=0;i<3;i++)
        {
            var group=CardUi.Rect(dt,"LevelGroup"+(i+1),36,351+i*47,83,46);view.levelGroups[i]=group.gameObject;
            CardUi.Box(group,"LevelBadge",17,0,46,20,colors[i]);
            view.levelTexts[i]=CardUi.Label(group,"LevelLabel","",18,-2,47,25,17,Color.white,FontStyle.Bold);
            view.coreTexts[i]=CardUi.Label(group,"RequiredCores","",0,-2,18,25,18,Color.black,FontStyle.Bold);
            view.coreTexts[i].verticalOverflow=VerticalWrapMode.Overflow;
            view.bpTexts[i]=CardUi.Label(group,"BP","",0,19,85,29,24,Color.black,FontStyle.Bold);
            Typeface(view.levelTexts[i],"Tinos-Bold",20);
            Typeface(view.coreTexts[i],"Tinos-Bold",21);
            Typeface(view.bpTexts[i],"ArchivoBlack-Regular",23);
            Stroke(view.levelTexts[i],new Color(0,0,0,.65f),.4f);
            // Numeric BP has its own line; never truncate a second line under the core label.
            view.bpTexts[i].verticalOverflow=VerticalWrapMode.Overflow;
            view.levelTexts[i].verticalOverflow=VerticalWrapMode.Overflow;
        }
        view.rulesHeading=CardUi.Label(dt,"EffectLevel","",116,348,242,20,12,Color.black,FontStyle.Bold);
        view.rulesText=CardUi.Label(dt,"EffectText","",116,371,242,93,12,Color.black,FontStyle.Bold,TextAnchor.UpperLeft);
        view.flavorText=CardUi.Label(dt,"Flavor","",35,500,274,29,9,CardUi.Hex("383838"));
        Typeface(view.rulesHeading,"BIZUDGothic-Bold",12);
        Typeface(view.rulesText,"BIZUDGothic-Bold",11,false);
        Typeface(view.flavorText,"BIZUDMincho-Regular",9,false);
        // The printed format stays identical at all three comparison sizes.
        view.compactBody=CardUi.Rect(t,"CompactBody",0,0,400,560).gameObject;
        view.compactPrimary=CardUi.Label(view.compactBody.transform,"UnusedBP","",0,0,1,1,12,Color.black);
        view.compactSecondary=CardUi.Label(view.compactBody.transform,"UnusedState","",0,0,1,1,12,Color.black);
        view.symbolReference=Raw(t,"AttributeSymbol",324,490,43,46);
        view.symbol=CardUi.Box(t,"FallbackSymbol",330,496,26,29,Color.white,false,true);
        view.idText=CardUi.Label(t,"CardId","",30,539,335,13,8,Color.white);
        view.idText.gameObject.SetActive(false); // Original footer belongs to the supplied frame reference.
        view.accentSurfaces=new Image[0];
        PrefabUtility.SaveAsPrefabAsset(root,Path);Object.DestroyImmediate(root);AssetDatabase.SaveAssets();
    }
    // Static font faces are already bold/italic; do not synthesize another style.
    static void Typeface(Text text,string face,int size,bool singleLine=true)
    {
        var font=AssetDatabase.LoadAssetAtPath<Font>("Assets/Resources/CardQuality/Fonts/"+face+".ttf");
        if(font==null)throw new System.InvalidOperationException("Card font missing: "+face);
        text.font=font;text.fontStyle=FontStyle.Normal;text.fontSize=size;
        text.resizeTextForBestFit=false;
        text.horizontalOverflow=singleLine?HorizontalWrapMode.Overflow:HorizontalWrapMode.Wrap;
        text.verticalOverflow=VerticalWrapMode.Overflow;
    }
    static void Stroke(Text text,Color color,float width)
    {
        var outline=text.gameObject.AddComponent<Outline>();
        outline.effectColor=color;outline.effectDistance=new Vector2(width,-width);
        outline.useGraphicAlpha=true;
    }
    static RawImage Raw(Transform parent,string name,float x,float y,float w,float h)
    {
        var image=CardUi.Rect(parent,name,x,y,w,h).gameObject.AddComponent<RawImage>();image.raycastTarget=false;return image;
    }
}

public sealed class CardQualityTextureImporter : AssetPostprocessor
{
    void OnPreprocessTexture()
    {
        if(!assetPath.StartsWith("Assets/Resources/CardQuality/Art/") && !assetPath.StartsWith("Assets/Resources/CardQuality/Frames/"))return;
        var importer=(TextureImporter)assetImporter;
        importer.textureType=TextureImporterType.Default;importer.npotScale=TextureImporterNPOTScale.None;
        importer.maxTextureSize=2048;importer.mipmapEnabled=true;importer.sRGBTexture=true;
        importer.isReadable=false;importer.textureCompression=TextureImporterCompression.Uncompressed;
        importer.filterMode=FilterMode.Trilinear;importer.wrapMode=TextureWrapMode.Clamp;
    }
}
