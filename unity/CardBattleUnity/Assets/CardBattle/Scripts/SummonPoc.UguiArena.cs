using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Hundred.CardBattle
{
    // The battle HUD is rebuilt from the authoritative snapshot. Complex legacy
    // dialogs stay available during the staged migration from IMGUI to UGUI.
    public sealed partial class SummonPoc
    {
        GameObject arenaUguiRoot;
        RectTransform uguiLeft, uguiEnemy, uguiField, uguiHand, uguiRight, uguiStatus;
        Font uguiFont;
        int uguiVersion = -1;
        float uguiNextRefresh;
        readonly Color uguiInk = new Color(.94f,.95f,.91f);
        readonly Color uguiPanel = new Color(.025f,.045f,.05f,.90f);
        readonly Color uguiPanelSoft = new Color(.045f,.07f,.07f,.82f);
        readonly Color uguiGold = new Color(.74f,.74f,.67f);
        readonly Color uguiCyan = new Color(.32f,.86f,.9f);

        void CreateArenaUgui()
        {
            if(arenaUguiRoot != null)return;
            uguiFont=Resources.Load<Font>("CardQuality/Fonts/BIZUDGothic-Bold") ?? Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var canvasObject=new GameObject("BattleArenaCanvas",typeof(Canvas),typeof(CanvasScaler),typeof(GraphicRaycaster));
            arenaUguiRoot=canvasObject;
            var canvas=canvasObject.GetComponent<Canvas>();canvas.renderMode=RenderMode.ScreenSpaceOverlay;canvas.sortingOrder=20;
            var scaler=canvasObject.GetComponent<CanvasScaler>();scaler.uiScaleMode=CanvasScaler.ScaleMode.ScaleWithScreenSize;scaler.referenceResolution=new Vector2(1920,900);scaler.matchWidthOrHeight=.55f;
            if(EventSystem.current==null)new GameObject("BattleEventSystem",typeof(EventSystem),typeof(StandaloneInputModule));
            var root=canvasObject.GetComponent<RectTransform>();Stretch(root,0,0,1,1,0,0,0,0);
            var backgroundObject=new GameObject("Continuous play surface",typeof(ArenaBackdropGraphic));backgroundObject.transform.SetParent(root,false);var background=backgroundObject.GetComponent<RectTransform>();Stretch(background,0,0,1,1,0,0,0,0);background.SetAsFirstSibling();
            uguiLeft=Panel(root,"Left HUD",new Color(0,0,0,0),false);Stretch(uguiLeft,0,0,.10f,1,6,6,-6,-6);
            uguiRight=Panel(root,"Right HUD",new Color(0,0,0,0),false);Stretch(uguiRight,.90f,0,1,1,6,6,-6,-6);
            uguiEnemy=Panel(root,"Opponent",new Color(0,0,0,0),false);Stretch(uguiEnemy,.105f,1,.895f,1,0,-170,0,-8);
            uguiField=Panel(root,"Field",new Color(0,0,0,0),false);Stretch(uguiField,.105f,0,.895f,1,0,180,0,-178);
            uguiHand=Panel(root,"Hand",new Color(0,0,0,0),false);Stretch(uguiHand,.105f,0,.895f,0,0,32,0,175);
            uguiStatus=Panel(root,"Status",new Color(.015f,.04f,.05f,.80f),false);Stretch(uguiStatus,.105f,0,1,0,0,4,-8,30);
            arenaUguiRoot.SetActive(false);
        }

        void LateUpdate()
        {
            if(arenaUguiRoot==null)return;
            bool normal=state!=null&&summonDraft==null&&!detailsOpen&&!arenaMenu&&arenaCardId==null&&Hundred.CardBattle.Presentation.CardQualityPreview.IsOpen==false;
            if(!normal){arenaUguiRoot.SetActive(false);return;}
            if(!arenaUguiRoot.activeSelf)arenaUguiRoot.SetActive(true);
            if(state.version!=uguiVersion||Time.unscaledTime>=uguiNextRefresh){uguiVersion=state.version;uguiNextRefresh=Time.unscaledTime+.5f;RenderArenaUgui();}
        }

        void RenderArenaUgui()
        {
            Clear(uguiLeft);Clear(uguiEnemy);Clear(uguiField);Clear(uguiHand);Clear(uguiRight);Clear(uguiStatus);
            RenderLeft();RenderEnemy();RenderField();RenderHand();RenderRight();RenderStatus();
        }

        void RenderLeft()
        {
            var turn=Panel(uguiLeft,"Turn",new Color(0,0,0,0),false);Place(turn,8,8,-8,48);
            Label(turn,(state.isYourTurn?"YOUR TURN  ":"OPPONENT  ")+state.turn,16,TextAnchor.MiddleCenter,uguiGold);
            var opponent=Panel(uguiLeft,"Opponent stats",new Color(0,0,0,0),false);Place(opponent,8,64,-8,118);
            var op=state.opponent;Label(opponent,"相手\n\nライフ  "+(op==null?"—":op.life.ToString())+"\nリザーブ  "+(op==null?"—":op.reserve.ToString())+"\n手札  "+(op==null?"—":op.handCount.ToString()),14,TextAnchor.UpperLeft,uguiInk,new Vector4(12,10,8,8));
            var info=Panel(uguiLeft,"Area info",new Color(0,0,0,0),false);Place(info,8,190,-8,260);
            Label(info,"エリア情報\n\n"+arenaInfo+"\n\n"+arenaNote,13,TextAnchor.UpperLeft,uguiInk,new Vector4(12,10,8,8));
            Label(uguiLeft,"自分のライフ  "+state.self.life,13,TextAnchor.MiddleLeft,uguiInk,new Vector4(12,0,0,0),460,26);
            var life=Panel(uguiLeft,"Life",new Color(0,0,0,0),false);Place(life,8,488,-8,72);RenderLifeGrid(life,state.self.life);
            Label(uguiLeft,"リザーブ  "+state.self.reserve,13,TextAnchor.MiddleLeft,uguiInk,new Vector4(12,0,0,0),568,26);
            var reserve=Button(uguiLeft,"Reserve",ArenaMain&&state.self.reserve>0,()=>{arenaPlaceCore=!arenaPlaceCore;RenderArenaUgui();},arenaPlaceCore?new Color(.12f,.31f,.32f,.75f):new Color(0,0,0,0));Place(reserve.GetComponent<RectTransform>(),8,596,-8,112);
            RenderCoreGrid(reserve.GetComponent<RectTransform>(),state.self.reserve,25);
            Label(reserve.GetComponent<RectTransform>(),arenaPlaceCore?"配置先を選択":"",12,TextAnchor.LowerCenter,Color.white,new Vector4(4,4,4,7));
            var menu=Button(uguiLeft,"Menu",true,()=>{arenaMenu=true;arenaUguiRoot.SetActive(false);},uguiPanel);Place(menu.GetComponent<RectTransform>(),8,42,-8,36,true);Label(menu.GetComponent<RectTransform>(),"ルーム / 操作",13,TextAnchor.MiddleCenter,uguiInk);
        }

        void RenderEnemy()
        {
            Label(uguiEnemy,state.ready?"対戦相手":"相手の参加待ち",13,TextAnchor.UpperLeft,uguiInk,new Vector4(0,4,0,0));
            var cards=state.opponent==null?null:state.opponent.field;
            RenderCardRow(uguiEnemy,cards,2,true,90,128,38);
            Label(uguiEnemy,"ネクサス",12,TextAnchor.UpperRight,new Color(uguiInk.r,uguiInk.g,uguiInk.b,.7f),new Vector4(0,4,8,0));
        }

        void RenderField()
        {
            Label(uguiField,"自分のフィールド",12,TextAnchor.UpperLeft,new Color(uguiInk.r,uguiInk.g,uguiInk.b,.58f),new Vector4(8,5,0,0));
            Label(uguiField,"FIELD",34,TextAnchor.MiddleCenter,new Color(uguiInk.r,uguiInk.g,uguiInk.b,.10f));
            var cards=state.self.field??new Card[0];
            int rows=Math.Max(1,(cards.Length+2)/3);float slot=Mathf.Min(245,(uguiField.rect.height-42)/rows-12);float height=slot;float width=height*.688f;
            for(int row=0;row<rows;row++)
            {
                int count=Math.Min(3,cards.Length-row*3);float total=count*slot+(count-1)*20;
                for(int col=0;col<count;col++)CreateCard(uguiField,cards[row*3+col],1,false,new Vector2((col*slot+col*20)-total/2+slot/2,(rows-1)*.5f*(slot+15)-row*(slot+15)-8),new Vector2(width,height));
            }
        }

        void RenderHand()
        {
            Label(uguiHand,"自分の手札",12,TextAnchor.UpperLeft,uguiInk,new Vector4(8,5,0,0));
            var cards=state.self.hand??new Card[0];float gap=8;float available=Mathf.Max(320,uguiHand.rect.width-150);float width=Mathf.Clamp((available-gap*Mathf.Max(0,cards.Length-1))/Mathf.Max(1,cards.Length),72,112);float height=Mathf.Min(145,width/0.72f);float step=width+gap;float total=cards.Length==0?0:width+(cards.Length-1)*step;
            for(int i=0;i<cards.Length;i++)
            {
                float centered=i*step-total/2+width/2;
                var card=CreateCard(uguiHand,cards[i],0,false,new Vector2(centered,-9),new Vector2(width,height));card.SetSiblingIndex(i+1);
            }
            Label(uguiHand,"ネクサス",12,TextAnchor.UpperRight,new Color(uguiInk.r,uguiInk.g,uguiInk.b,.6f),new Vector4(0,5,8,0));
        }

        void RenderRight()
        {
            Label(uguiRight,"デッキ",13,TextAnchor.UpperLeft,uguiInk,new Vector4(12,14,0,0));
            var enemyDeck=Panel(uguiRight,"Enemy deck",new Color(.035f,.07f,.075f,.76f),true);Place(enemyDeck,18,48,-18,116);Label(enemyDeck,"相手\nDECK",12,TextAnchor.MiddleCenter,uguiInk);
            var ownDeck=Panel(uguiRight,"Own deck",new Color(.035f,.07f,.075f,.76f),true);Place(ownDeck,18,190,-18,158);Label(ownDeck,"自分\nDECK",12,TextAnchor.MiddleCenter,uguiInk);
            Label(uguiRight,"トラッシュ",13,TextAnchor.MiddleLeft,uguiInk,new Vector4(12,0,0,0),364,28);
            var trash=Panel(uguiRight,"Trash",new Color(0,0,0,0),false);Place(trash,12,394,-12,72);RenderCoreGrid(trash,state.self.trashCores,24);
            string[] phases={"START","CORE","DRAW","REFRESH","MAIN","ATTACK","END"};float y=484;
            foreach(var phase in phases){var row=Panel(uguiRight,phase,state.phase==phase?new Color(.12f,.34f,.29f):new Color(0,0,0,0),state.phase==phase);Place(row,10,y,-10,25);Label(row,PhaseName(phase),12,TextAnchor.MiddleLeft,state.phase==phase?Color.white:uguiInk,new Vector4(12,0,0,0));y+=27;}
            bool next=ArenaIdle&&(state.canDefend||state.isYourTurn&&!state.waitingForDefense);var nextButton=Button(uguiRight,"Next",next,()=>{if(state.canDefend)Defend(true,"");else{var id=Guid.NewGuid().ToString();Submit("/api/game/next-step",new StepCommand{requestId=id,expectedVersion=state.version},id);}},new Color(.12f,.36f,.31f));Place(nextButton.GetComponent<RectTransform>(),10,12,-10,48,true);Label(nextButton.GetComponent<RectTransform>(),state.canDefend?"ライフで受ける":state.phase=="END"?"相手のターンへ":"次のステップ",14,TextAnchor.MiddleCenter,Color.white);
        }

        void RenderStatus()
        {
            string status=state.finished?(state.winner==state.playerNumber?"あなたの勝利":"あなたの敗北"):state.paused?"検証停止："+state.pauseReason:state.canDefend?"攻撃を受けています。ブロックするカード、またはライフで受けるを選択。":message;
            var accent=Panel(uguiStatus,"Accent",state.canDefend?new Color(.95f,.4f,.24f):uguiCyan,false);Stretch(accent,0,0,0,1,0,0,4,0);
            Label(uguiStatus,status,12,TextAnchor.MiddleLeft,uguiInk,new Vector4(14,0,8,0));
        }

        RectTransform CreateCard(RectTransform parent,Card cardData,int zone,bool compact,Vector2 position,Vector2 size)
        {
            var button=Button(parent,"Card "+cardData.cardId,true,()=>{if(arenaPlaceCore&&zone==1&&ArenaMain&&state.self.reserve>0){arenaPlaceCore=false;MoveCore("",cardData.instanceId);}else{arenaCardId=cardData.instanceId;arenaZone=zone;arenaModalScroll=Vector2.zero;arenaUguiRoot.SetActive(false);}},uguiGold);
            var rect=button.GetComponent<RectTransform>();rect.anchorMin=rect.anchorMax=new Vector2(.5f,.5f);rect.pivot=new Vector2(.5f,.5f);rect.anchoredPosition=position;rect.sizeDelta=size;
            if(zone==1&&cardData.exhausted)rect.localEulerAngles=new Vector3(0,0,-90);
            var face=ArenaFace(cardData);if(face!=null){var raw=new GameObject("Face",typeof(RawImage)).GetComponent<RawImage>();raw.transform.SetParent(rect,false);Stretch(raw.rectTransform,0,0,1,1,2,2,-2,-2);raw.texture=face;raw.raycastTarget=false;}
            else
            {
                var art=ArenaImage(cardData);if(art!=null){var raw=new GameObject("Art",typeof(RawImage)).GetComponent<RawImage>();raw.transform.SetParent(rect,false);Stretch(raw.rectTransform,0,.38f,1,1,2,0,-2,-2);raw.texture=art;raw.uvRect=CoverUv(art,size.x,size.y*.62f);raw.raycastTarget=false;}
                Label(rect,cardData.cost.ToString(),18,TextAnchor.UpperLeft,Color.white,new Vector4(7,4,0,0));Label(rect,cardData.name,Mathf.Clamp((int)(size.x/9),10,14),TextAnchor.LowerCenter,Color.black,new Vector4(4,0,4,31));
            }
            if(zone==1){var stats=Panel(rect,"Live stats",new Color(0,0,0,.82f),false);Stretch(stats,0,0,1,0,3,3,-3,25);Label(stats,"Lv"+cardData.level+"  BP "+cardData.bp,11,TextAnchor.MiddleLeft,Color.white,new Vector4(5,0,0,0));RenderCoreGrid(rect,cardData.cores,16,true);}
            var hover=button.gameObject.AddComponent<ArenaUguiHover>();hover.Target=rect;hover.Lift=zone==0?18:8;hover.Scale=zone==0?1.12f:1.05f;hover.Highlight=uguiCyan;
            return rect;
        }

        void RenderCardRow(RectTransform parent,Card[] cards,int zone,bool compact,float width,float height,float y)
        {cards=cards??new Card[0];float gap=12,total=cards.Length*width+Math.Max(0,cards.Length-1)*gap;for(int i=0;i<cards.Length;i++)CreateCard(parent,cards[i],zone,compact,new Vector2(i*(width+gap)-total/2+width/2,y),new Vector2(width,height));}

        void RenderCoreGrid(RectTransform parent,int count,float size,bool bottomRight=false)
        {
            int shown=Math.Min(18,count);for(int i=0;i<shown;i++){var core=Panel(parent,"Core",new Color(.25f,.82f,.92f),true);var r=core;r.anchorMin=r.anchorMax=bottomRight?new Vector2(1,0):new Vector2(0,1);r.pivot=bottomRight?new Vector2(1,0):new Vector2(0,1);int col=i%6,row=i/6;r.anchoredPosition=bottomRight?new Vector2(-5-col*(size*.62f),5+row*(size*.68f)):new Vector2(8+col*(size*.7f),-8-row*(size*.75f));r.sizeDelta=new Vector2(size*.56f,size);}
        }

        void RenderLifeGrid(RectTransform parent,int count)
        {
            for(int i=0;i<6;i++)
            {
                var slot=Panel(parent,"Life slot",new Color(0,0,0,0),false);
                slot.anchorMin=slot.anchorMax=new Vector2((i%3+.5f)/3f,1-(i/3+.5f)/2f);slot.pivot=new Vector2(.5f,.5f);slot.sizeDelta=new Vector2(42,32);
                if(i<count){var core=Panel(slot,"Life core",new Color(.25f,.82f,.92f),true);core.anchorMin=core.anchorMax=new Vector2(.5f,.5f);core.pivot=new Vector2(.5f,.5f);core.sizeDelta=new Vector2(16,25);}
            }
        }

        Rect CoverUv(Texture texture,float width,float height)
        {float source=(float)texture.width/texture.height,target=width/height;if(source>target){float visible=target/source;return new Rect((1-visible)/2,0,visible,1);}float v=source/target;return new Rect(0,(1-v)/2,1,v);}
        void Clear(RectTransform parent){for(int i=parent.childCount-1;i>=0;i--)Destroy(parent.GetChild(i).gameObject);}
        RectTransform Panel(RectTransform parent,string name,Color color,bool outline)
        {var go=new GameObject(name,typeof(Image));go.transform.SetParent(parent,false);var image=go.GetComponent<Image>();image.color=color;image.raycastTarget=false;if(outline){var o=go.AddComponent<Outline>();o.effectColor=new Color(uguiGold.r,uguiGold.g,uguiGold.b,.48f);o.effectDistance=new Vector2(1,-1);}return go.GetComponent<RectTransform>();}
        Button Button(RectTransform parent,string name,bool enabled,Action action,Color color)
        {var go=new GameObject(name,typeof(Image),typeof(Button));go.transform.SetParent(parent,false);var image=go.GetComponent<Image>();image.color=enabled?color:new Color(.12f,.14f,.14f,.82f);var b=go.GetComponent<Button>();b.interactable=enabled;b.targetGraphic=image;b.onClick.AddListener(()=>action());var colors=b.colors;colors.highlightedColor=Color.Lerp(image.color,Color.white,.14f);colors.pressedColor=Color.Lerp(image.color,Color.black,.18f);b.colors=colors;return b;}
        Text Label(RectTransform parent,string value,int size,TextAnchor anchor,Color color,Vector4 padding=default(Vector4),float top=0,float height=0)
        {var go=new GameObject("Label",typeof(Text));go.transform.SetParent(parent,false);var text=go.GetComponent<Text>();text.font=uguiFont;text.fontSize=size;text.color=color;text.alignment=anchor;text.text=value;text.horizontalOverflow=HorizontalWrapMode.Wrap;text.verticalOverflow=VerticalWrapMode.Truncate;text.raycastTarget=false;var r=text.rectTransform;if(height>0)Place(r,padding.x,top,-padding.z,height);else Stretch(r,0,0,1,1,padding.x,padding.w,-padding.z,-padding.y);return text;}
        void Stretch(RectTransform r,float minX,float minY,float maxX,float maxY,float left,float bottom,float right,float top){r.anchorMin=new Vector2(minX,minY);r.anchorMax=new Vector2(maxX,maxY);r.offsetMin=new Vector2(left,bottom);r.offsetMax=new Vector2(right,top);}
        void Place(RectTransform r,float left,float top,float right,float height,bool bottom=false){r.anchorMin=new Vector2(0,bottom?0:1);r.anchorMax=new Vector2(1,bottom?0:1);r.pivot=new Vector2(.5f,bottom?0:1);r.offsetMin=new Vector2(left,bottom?top:-top-height);r.offsetMax=new Vector2(right,bottom?top+height:-top);}
    }

    public sealed class ArenaUguiHover : MonoBehaviour,IPointerEnterHandler,IPointerExitHandler
    {
        public RectTransform Target;public float Lift=8,Scale=1.05f;public Color Highlight=Color.cyan;
        Vector2 origin;Vector3 scale;Outline outline;
        void Start(){origin=Target.anchoredPosition;scale=Target.localScale;outline=gameObject.AddComponent<Outline>();outline.effectColor=new Color(Highlight.r,Highlight.g,Highlight.b,0);outline.effectDistance=new Vector2(3,-3);}
        public void OnPointerEnter(PointerEventData eventData){Target.SetAsLastSibling();Target.anchoredPosition=origin+Vector2.up*Lift;Target.localScale=scale*Scale;outline.effectColor=new Color(Highlight.r,Highlight.g,Highlight.b,.9f);}
        public void OnPointerExit(PointerEventData eventData){Target.anchoredPosition=origin;Target.localScale=scale;outline.effectColor=new Color(Highlight.r,Highlight.g,Highlight.b,0);}
    }

    // A texture-free play surface. A small vertex grid creates one continuous
    // stone/sand-like field without exposing the UI region boundaries.
    public sealed class ArenaBackdropGraphic : MaskableGraphic
    {
        protected override void Awake(){base.Awake();raycastTarget=false;}

        protected override void OnPopulateMesh(VertexHelper vertexHelper)
        {
            vertexHelper.Clear();
            const int columns=16,rows=10;
            var area=rectTransform.rect;
            for(int y=0;y<rows;y++)
            for(int x=0;x<columns;x++)
            {
                float u0=(float)x/columns,u1=(float)(x+1)/columns;
                float v0=(float)y/rows,v1=(float)(y+1)/rows;
                int start=vertexHelper.currentVertCount;
                vertexHelper.AddVert(new Vector3(Mathf.Lerp(area.xMin,area.xMax,u0),Mathf.Lerp(area.yMin,area.yMax,v0)),SurfaceColor(u0,v0),new Vector2(u0,v0));
                vertexHelper.AddVert(new Vector3(Mathf.Lerp(area.xMin,area.xMax,u0),Mathf.Lerp(area.yMin,area.yMax,v1)),SurfaceColor(u0,v1),new Vector2(u0,v1));
                vertexHelper.AddVert(new Vector3(Mathf.Lerp(area.xMin,area.xMax,u1),Mathf.Lerp(area.yMin,area.yMax,v1)),SurfaceColor(u1,v1),new Vector2(u1,v1));
                vertexHelper.AddVert(new Vector3(Mathf.Lerp(area.xMin,area.xMax,u1),Mathf.Lerp(area.yMin,area.yMax,v0)),SurfaceColor(u1,v0),new Vector2(u1,v0));
                vertexHelper.AddTriangle(start,start+1,start+2);vertexHelper.AddTriangle(start,start+2,start+3);
            }
        }

        Color32 SurfaceColor(float u,float v)
        {
            float dx=(u-.52f)*1.25f,dy=(v-.48f)*.82f;
            float center=1-Mathf.Clamp01(Mathf.Sqrt(dx*dx+dy*dy));
            float ripple=(Mathf.Sin((u*13+v*7)*Mathf.PI)+Mathf.Sin((u*5-v*11)*Mathf.PI))*.006f;
            float light=.075f+center*.075f+ripple;
            return new Color(light*.86f,light,light*.94f,1);
        }
    }
}
