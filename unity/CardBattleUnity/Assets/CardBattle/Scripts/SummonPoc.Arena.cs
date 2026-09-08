using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Networking;

namespace Hundred.CardBattle
{
    // Presentation only: every move is submitted through the existing authoritative API.
    public sealed partial class SummonPoc
    {
        readonly Dictionary<string, Texture2D> arenaArt = new Dictionary<string, Texture2D>();
        readonly HashSet<string> arenaLoading = new HashSet<string>();
        readonly Dictionary<string,float> arenaFailures = new Dictionary<string,float>();
        string arenaCardId, arenaInfo = "エリアを選択", arenaNote = "ホバー／タップで数と説明を表示します。";
        int arenaZone;
        bool arenaPlaceCore, arenaMenu;
        float arenaInfoUntil;
        Vector2 arenaHandScroll, arenaModalScroll;
        GUIStyle arenaText, arenaSmall, arenaNumber, arenaButton;
        readonly Color arenaPaper = new Color(.88f,.85f,.73f);
        bool ArenaIdle => !busy && pendingId == null && state != null && state.ready && !state.finished && !state.paused;
        bool ArenaMain => ArenaIdle && state.isYourTurn && state.phase == "MAIN";
        void ArenaStyles()
        {
            if(arenaText!=null)return;
            arenaText=Style(16);arenaSmall=Style(13);arenaNumber=Style(23,FontStyle.Bold);
            var arenaFont=Resources.Load<Font>("CardQuality/Fonts/BIZUDGothic-Bold");
            if(arenaFont!=null){arenaText.font=arenaFont;arenaSmall.font=arenaFont;arenaNumber.font=arenaFont;}
            arenaButton=new GUIStyle(button){font=arenaText.font,fontSize=14,wordWrap=true};
        }
        void ArenaBox(Rect r,Color color){var old=GUI.color;GUI.color=color;GUI.DrawTexture(r,Texture2D.whiteTexture);GUI.color=old;}
        void ArenaLabel(Rect r,string text,int size=14,Color? color=null)
        {
            var style=new GUIStyle(arenaText){fontSize=Math.Max(13,size)};style.normal.textColor=color??new Color(.88f,.91f,.83f);GUI.Label(r,text,style);
        }
        bool ArenaButton(Rect r,string text,bool enabled=true)
        {bool old=GUI.enabled;GUI.enabled=old&&enabled;bool hit=GUI.Button(r,text,arenaButton);GUI.enabled=old;return hit;}
        void ArenaInspect(Rect r,string text,string note)
        {
            if(!GUI.enabled)return;
            if(r.Contains(Event.current.mousePosition)){arenaInfo=text;arenaNote=note;arenaInfoUntil=Time.realtimeSinceStartup+1;}
        }
        void ArenaCores(Rect r,int count,int max=18)
        {
            int n=Math.Min(count,max);if(n<=0)return;
            int cols=Math.Max(1,Math.Min(6,(int)(r.width/17)));float size=Math.Min(15,r.width/cols-2);
            for(int i=0;i<n;i++)
            {
                float x=r.x+(i%cols)*(size+2),y=r.y+(i/cols)*(size+4);
                if(y+size>r.yMax)break;
                
                ArenaBox(new Rect(x,y,size*.72f,size),new Color(.28f,.76f,.83f));ArenaBox(new Rect(x,y,size*.3f,size*.55f),new Color(.72f,1,1));
            }
        }
        Texture2D ArenaImage(Card c)
        {
            string key=c.illustration==null?"":c.illustration.objectKey;
            if(string.IsNullOrEmpty(key)||key.Contains("..")||!System.Text.RegularExpressions.Regex.IsMatch(key,@"^[A-Za-z0-9_-]+(/[A-Za-z0-9_.-]+)+$"))return null;
            if(arenaArt.TryGetValue(key,out var texture))return texture;
            if(arenaArt.Count<64&&!arenaLoading.Contains(key)&&(!arenaFailures.TryGetValue(key,out var failed)||Time.realtimeSinceStartup-failed>15))
            {arenaLoading.Add(key);StartCoroutine(ArenaLoadArt(key));}
            return null;
        }
        IEnumerator ArenaLoadArt(string key)
        {
            using(var request=UnityWebRequestTexture.GetTexture(BaseUrl+"/card-art/"+key,true))
            {
                request.timeout=10;yield return request.SendWebRequest();
                if(request.result==UnityWebRequest.Result.Success){var t=DownloadHandlerTexture.GetContent(request);t.wrapMode=TextureWrapMode.Clamp;arenaArt[key]=t;}
                else arenaFailures[key]=Time.realtimeSinceStartup;
            }
            arenaLoading.Remove(key);
        }
        void OnDestroy(){foreach(var t in arenaArt.Values)if(t!=null)Destroy(t);}
        void ArenaCard(Rect r,Card c,int zone,bool compact=false)
        {
            var saved=GUI.matrix;
            if(zone==1&&c.exhausted)GUIUtility.RotateAroundPivot(-90,r.center);
            ArenaBox(r,new Color(.66f,.55f,.34f));var inner=new Rect(r.x+2,r.y+2,r.width-4,r.height-4);ArenaBox(inner,arenaPaper);
            var artRect=new Rect(inner.x,inner.y,inner.width,inner.height*(compact?.76f:.57f));var art=ArenaImage(c);
            if(art!=null)GUI.DrawTexture(artRect,art,ScaleMode.ScaleAndCrop);else ArenaBox(artRect,new Color(.14f,.23f,.25f));
            float nameY=artRect.yMax;
            ArenaLabel(new Rect(r.x+4,nameY,r.width-8,21),c.name,Mathf.Clamp((int)(r.width/10),9,14),Color.black);
            ArenaLabel(new Rect(r.x+5,nameY+20,r.width-10,25),"Lv"+(zone==0&&c.levels!=null&&c.levels.Length>0?c.levels[0].level:c.level)+"  "+(zone==0&&c.levels!=null&&c.levels.Length>0?c.levels[0].bp:c.bp),compact?12:16,Color.black);
            if(!compact)
            {
                ArenaLabel(new Rect(r.x+5,nameY+44,r.width-10,19),ColorName(c.color)+(zone==0?" / 手札":" / "+(c.exhausted?"疲労":"回復")),10,Color.black);
                ArenaCores(new Rect(r.x+r.width*.52f,nameY+23,r.width*.43f,Math.Max(15,r.yMax-nameY-28)),c.cores);
                ArenaLabel(new Rect(r.x+5,r.y+3,30,24),c.cost.ToString(),19);
            }
            if(GUI.Button(r,GUIContent.none,GUIStyle.none))
            {
                if(arenaPlaceCore&&zone==1&&ArenaMain&&state.self.reserve>0){arenaPlaceCore=false;MoveCore("",c.instanceId);}
                else{arenaCardId=c.instanceId;arenaZone=zone;arenaModalScroll=Vector2.zero;}
            }
            GUI.matrix=saved;
        }
        void ArenaField(Rect r,Card[] cards,int zone)
        {
            cards=cards??new Card[0];int rows=Math.Max(1,(cards.Length+2)/3);
            float length=Math.Min(220,Math.Min(r.width/3-12,r.height/Math.Max(2,rows)-10));
            for(int row=0;row<rows;row++)
            {
                int n=Math.Min(3,cards.Length-row*3);float start=r.center.x-n*(length+10)/2;
                float y=r.center.y-rows*(length+10)/2+row*(length+10);
                for(int col=0;col<n;col++)ArenaCard(new Rect(start+col*(length+10)+length*.155f,y,length*.69f,length),cards[row*3+col],zone);
            }
            ArenaInspect(r,"自分のスピリット "+cards.Length+" / 6 体","カードを選んで詳細・コア操作・攻撃を確認できます。");
        }
        void DrawArena()
        {
            ArenaStyles();float scale=Screen.width<700?Screen.width/540f:Screen.height/900f;
            float w=Screen.width/scale,h=Screen.height/scale;bool portrait=w<h;
            GUI.matrix=Matrix4x4.Scale(Vector3.one*scale);
            ArenaBox(new Rect(0,0,w,h),new Color(.20f,.27f,.25f));

            float nav=portrait?92:Math.Max(140,w*.1f),rail=portrait?100:Math.Max(135,w*.1f);
            float x=nav+15,fieldW=w-nav-rail-30,enemyH=portrait?145:160,handH=portrait?150:160;
            bool modal=arenaCardId!=null||arenaMenu;
            GUI.enabled=!modal;
            ArenaBox(new Rect(8,8,nav-16,36),new Color(.06f,.13f,.16f));
            ArenaLabel(new Rect(15,14,nav-25,26),state.ready?(state.isYourTurn?"Your Turn ":"Opponent ")+state.turn:"参加待ち",14);
            ArenaBox(new Rect(8,53,nav-16,110),new Color(.06f,.13f,.16f));
            var op=state.ready?state.opponent:null;
            ArenaLabel(new Rect(15,60,nav-26,100),"相手\nライフ "+(op==null?"—":op.life.ToString())+"\nリザーブ "+(op==null?"—":op.reserve.ToString())+"\n手札 "+(op==null?"—":op.handCount.ToString()),13);
            float infoH=Math.Max(155,h-545);
            ArenaBox(new Rect(8,173,nav-16,infoH),new Color(.06f,.13f,.16f));
            ArenaLabel(new Rect(15,181,nav-30,24),"エリア情報",11);
            ArenaLabel(new Rect(15,212,nav-30,infoH-38),arenaInfo+"\n\n"+arenaNote,12);
            float ly=183+infoH;
            ArenaLabel(new Rect(12,ly,nav-20,23),"自分のライフ",11);
            var lifeRect=new Rect(12,ly+24,nav-24,68);
            for(int i=0;i<Math.Min(6,state.self.life);i++)ArenaCores(new Rect(lifeRect.x+(i%3)*lifeRect.width/3,lifeRect.y+(i/3)*30,22,24),1);
            ArenaInspect(lifeRect,"自分のライフ "+state.self.life+" 個","コアの描画は最大6個。実際のライフ数に表示上の上限はありません。");
            var reserveRect=new Rect(12,ly+105,nav-24,100);
            ArenaLabel(new Rect(12,ly+84,nav-20,22),"リザーブ "+state.self.reserve,12);ArenaCores(reserveRect,state.self.reserve,30);
            if(ArenaButton(reserveRect,arenaPlaceCore?"置くカードを選択":"",ArenaMain&&state.self.reserve>0))arenaPlaceCore=!arenaPlaceCore;
            if(ArenaButton(new Rect(12,h-37,nav-24,29),"ルーム / 操作"))arenaMenu=true;
            ArenaLabel(new Rect(x,8,fieldW,20),state.ready?"対戦相手":"相手の参加待ち",11);
            int backs=op==null?0:Math.Min(op.handCount,10);
            for(int i=0;i<backs;i++){var back=new Rect(x+fieldW/2-backs*10+i*20,0,29,28);ArenaBox(back,new Color(.65f,.57f,.38f));ArenaBox(new Rect(back.x+2,back.y,25,25),new Color(.1f,.19f,.24f));}
            if(op!=null)
            {
                var cards=op.field??new Card[0];int n=cards.Length;float cw=Math.Min(105,(fieldW-100)/Math.Max(1,n)-9);
                for(int i=0;i<n;i++)ArenaCard(new Rect(x+fieldW/2-n*(cw+9)/2+i*(cw+9),38,cw,enemyH-52),cards[i],2,true);
            }
            ArenaLabel(new Rect(x+fieldW-Math.Min(105,fieldW*.22f),38,Math.Min(105,fieldW*.22f),24),"ネクサス",11);
            ArenaBox(new Rect(x,enemyH,fieldW,1),new Color(.55f,.56f,.40f));
            ArenaField(new Rect(x,enemyH+10,fieldW,h-enemyH-handH-48),state.self.field,1);
            float handY=h-handH-28;ArenaLabel(new Rect(x,handY,fieldW,22),"自分の手札",11);
            float nexusWidth=Math.Min(105,fieldW*.22f);ArenaLabel(new Rect(x+fieldW-nexusWidth,handY+25,nexusWidth,24),"ネクサス",11);ArenaInspect(new Rect(x+fieldW-nexusWidth,handY+25,nexusWidth,handH-30),"自分のネクサス 0 / 4 枚","現在の対戦マスターはスピリットのみです。");var handArea=new Rect(x,handY+24,fieldW-nexusWidth-8,handH-15);var hands=state.self.hand??new Card[0];
            float hw=Math.Min(110,(handArea.width-10)/Math.Max(1,hands.Length)-7);hw=Math.Max(65,hw);
            arenaHandScroll=GUI.BeginScrollView(handArea,arenaHandScroll,new Rect(0,0,Math.Max(handArea.width-20,hands.Length*(hw+7)),handH-36));
            for(int i=0;i<hands.Length;i++)ArenaCard(new Rect(i*(hw+7),0,hw,handH-40),hands[i],0);
            GUI.EndScrollView();ArenaInspect(handArea,"自分の手札 "+hands.Length+" 枚","カードをタップして召喚できます。");
            float rx=w-rail+4,rw=rail-16;
            ArenaDeck(new Rect(rx,28,rw,enemyH-45),op==null?0:op.deckCount,"相手のデッキ");
            ArenaDeck(new Rect(rx,enemyH+20,rw,Math.Min(190,h*.20f)),state.self.deckCount,"自分のデッキ");
            float trashY=enemyH+35+Math.Min(190,h*.20f);
            ArenaLabel(new Rect(rx,trashY,rw,22),"トラッシュ",11);var trashRect=new Rect(rx,trashY+24,rw,68);ArenaCores(trashRect,state.self.trashCores,24);
            ArenaInspect(trashRect,"捨て札 "+state.self.trashCount+"枚 / 使用コア "+state.self.trashCores,"支払ったコアは自分のリフレッシュでリザーブへ戻ります。");
            float py=trashY+96;string[] phases={"START","CORE","DRAW","REFRESH","MAIN","ATTACK","END"};
            foreach(var phase in phases){if(state.phase==phase)ArenaBox(new Rect(rx,py,rw,23),new Color(.14f,.35f,.31f));ArenaLabel(new Rect(rx+3,py,rw-5,23),PhaseName(phase),12);py+=24;}
            if(ArenaButton(new Rect(rx,py+7,rw,42),state.canDefend?"ライフで受ける":state.phase=="END"?"相手のターンへ":"次のステップ",ArenaIdle&&(state.canDefend||state.isYourTurn&&!state.waitingForDefense)))
            {if(state.canDefend)Defend(true,"");else{var id=Guid.NewGuid().ToString();Submit("/api/game/next-step",new StepCommand{requestId=id,expectedVersion=state.version},id);}}
            string status=state.finished?(state.winner==state.playerNumber?"あなたの勝利":"あなたの敗北"):state.paused?"検証停止："+state.pauseReason:state.canDefend?"攻撃を受けています。ブロックするカード、またはライフで受けるを選択。":message;
            ArenaLabel(new Rect(x,h-25,w-x-10,25),status,11);
            GUI.enabled=true;
            if(arenaMenu)ArenaMenu(w,h);
            else if(arenaCardId!=null)ArenaDialog(w,h);
        }
        void ArenaStone(float w,float h)
        {
            var center=new Vector2(w*.52f,h*.46f);
            for(float radius=90;radius<Math.Max(w,h);radius+=90)
                for(int i=0;i<48;i++)
                {
                    float a=i*Mathf.PI*2/48,b=(i+1)*Mathf.PI*2/48;
                    var from=center+new Vector2(Mathf.Cos(a),Mathf.Sin(a))*radius;
                    var to=center+new Vector2(Mathf.Cos(b),Mathf.Sin(b))*radius;
                    var saved=GUI.matrix;GUIUtility.RotateAroundPivot(Mathf.Atan2(to.y-from.y,to.x-from.x)*Mathf.Rad2Deg,from);
                    ArenaBox(new Rect(from.x,from.y,Vector2.Distance(from,to),1),new Color(.10f,.17f,.17f,.5f));GUI.matrix=saved;
                }
        }
        void ArenaDeck(Rect r,int count,string name)
        {
            ArenaBox(r,new Color(.60f,.53f,.34f));ArenaBox(new Rect(r.x+2,r.y+2,r.width-4,r.height-4),new Color(.11f,.21f,.25f));ArenaLabel(new Rect(r.x+6,r.center.y-12,r.width-12,24),"デッキ",12);ArenaInspect(r,name+" "+count+" 枚","山札の内容は非公開です。");
        }
        Card ArenaSelected()
        {
            var cards=arenaZone==0?state.self.hand:arenaZone==1?state.self.field:state.opponent==null?null:state.opponent.field;
            return cards==null?null:Array.Find(cards,c=>c.instanceId==arenaCardId);
        }
        Rect ArenaModal(float w,float h)
        {
            ArenaBox(new Rect(0,0,w,h),new Color(0,0,0,.75f));return new Rect((w-Math.Min(470,w-30))/2,Math.Max(15,(h-680)/2),Math.Min(470,w-30),Math.Min(680,h-30));
        }
        void ArenaDialog(float w,float h)
        {
            var c=ArenaSelected();if(c==null){arenaCardId=null;return;}
            var box=ArenaModal(w,h);
            if(Event.current.type==EventType.MouseDown&&!box.Contains(Event.current.mousePosition)||Event.current.type==EventType.KeyDown&&Event.current.keyCode==KeyCode.Escape){arenaCardId=null;Event.current.Use();return;}
            ArenaBox(box,new Color(.07f,.14f,.17f));
            if(ArenaButton(new Rect(box.xMax-42,box.y+8,32,30),"×")){arenaCardId=null;return;}
            var image=ArenaImage(c);if(image!=null)GUI.DrawTexture(new Rect(box.x+18,box.y+48,box.width-36,170),image,ScaleMode.ScaleAndCrop);
            ArenaLabel(new Rect(box.x+18,box.y+224,box.width-36,32),c.name,21);
            ArenaLabel(new Rect(box.x+18,box.y+263,box.width-36,70),ColorName(c.color)+" / "+c.family+" / コスト "+c.cost+"\n軽減 "+ColorCounts(c.reductions)+" / シンボル "+ColorCounts(c.symbolDefinitions),13);
            float y=box.y+335;
            if(c.levels!=null)foreach(var level in c.levels){ArenaLabel(new Rect(box.x+18,y,box.width-36,24),"Lv"+level.level+" / "+level.requiredCores+"コア / BP "+level.bp,13);y+=25;}
            ArenaLabel(new Rect(box.x+18,y,box.width-36,32),c.effect,12);y+=37;
            if(arenaZone==0)
            {
                if(ArenaButton(new Rect(box.x+18,y,box.width-36,40),"召喚（支払い "+c.summonCost+" ＋ 配置1）",ArenaMain&&state.self.field.Length<6&&state.self.reserve>=c.summonCost+1))
                {var id=Guid.NewGuid().ToString();Submit("/api/game/summon",new Command{requestId=id,expectedVersion=state.version,cardInstanceId=c.instanceId,coreCount=1,sources=new[]{new CoreSource{cardInstanceId="",count=c.summonCost+1}}},id);}
                if(ArenaButton(new Rect(box.x+18,y+47,box.width-36,36),"場のコアを使う / 配置数を選ぶ",ArenaMain&&state.self.field.Length<6))
                {summonDraft=c;draftVersion=state.version;draftCores=1;draftSources.Clear();draftSources[""]=Math.Min(state.self.reserve,c.summonCost+1);sourceScroll=Vector2.zero;arenaCardId=null;}
            }
            if(arenaZone==1)
            {
                ArenaLabel(new Rect(box.x+18,y,box.width-36,26),"コア "+c.cores+" / "+(c.exhausted?"疲労":"回復"),14);y+=30;
                if(ArenaButton(new Rect(box.x+18,y,box.width/2-23,36),"コア −1",ArenaMain&&c.cores>1))MoveCore(c.instanceId,"");
                if(ArenaButton(new Rect(box.center.x+5,y,box.width/2-23,36),"コア ＋1",ArenaMain&&state.self.reserve>0))MoveCore("",c.instanceId);
                if(ArenaButton(new Rect(box.x+18,y+45,box.width-36,40),state.canDefend?"ブロック":"アタック",ArenaIdle&&!c.exhausted&&(state.canAttack||state.canDefend)))
                {if(state.canDefend)Defend(false,c.instanceId);else{var id=Guid.NewGuid().ToString();Submit("/api/game/attack",new AttackCommand{requestId=id,expectedVersion=state.version,cardInstanceId=c.instanceId},id);}arenaCardId=null;}
            }
        }
        void ArenaMenu(float w,float h)
        {
            var box=ArenaModal(w,h);ArenaBox(box,new Color(.07f,.14f,.17f));
            if(Event.current.type==EventType.MouseDown&&!box.Contains(Event.current.mousePosition)){arenaMenu=false;Event.current.Use();return;}
            float x=box.x+18,y=box.y+25,bw=box.width-36;
            ArenaLabel(new Rect(x,y,bw,55),"ルーム "+state.roomCode+"\n"+state.masterVersion,17);y+=65;
            if(ArenaButton(new Rect(x,y,bw,36),"ルームIDをコピー"))CopyRoomId();y+=45;
            if(ArenaButton(new Rect(x,y,bw,36),"カード・捨て札一覧")){detailsOpen=true;arenaMenu=false;}y+=45;
            if(ArenaButton(new Rect(x,y,bw,36),"操作を再試行",!busy&&pendingId!=null))StartCoroutine(Send(pendingPath,pendingJson));y+=45;
            if(ArenaButton(new Rect(x,y,bw,36),"ロビーへ戻る",!busy)){state=null;token=null;ClearPending();arenaMenu=false;arenaCardId=null;}y+=45;
            if(ArenaButton(new Rect(x,y,bw,36),"閉じる"))arenaMenu=false;
        }
    }
}
