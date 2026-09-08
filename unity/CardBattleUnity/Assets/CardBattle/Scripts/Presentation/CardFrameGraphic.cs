using UnityEngine;
using UnityEngine.UI;

namespace Hundred.CardBattle.Presentation
{
    // Draw only the frame mesh. The open center contains no triangles, so the art
    // beneath remains visible without modifying the supplied reference texture.
    public sealed class CardFrameGraphic : MaskableGraphic
    {
        Texture source;
        Rect sourceBounds;
        bool purple;
        public override Texture mainTexture => source != null ? source : Texture2D.whiteTexture;

        public void Bind(Texture texture, Rect bounds, bool isPurple)
        {
            source=texture;sourceBounds=bounds;purple=isPurple;
            enabled=texture!=null;SetAllDirty();
        }

        // Hand-traced approximation of the header silhouette in 400 x 560 card space.
        static readonly Vector2[] RedHeader={
            new Vector2(0,69),new Vector2(20,69),new Vector2(27,73),
            new Vector2(40,76),new Vector2(54,74),new Vector2(65,67),
            new Vector2(74,60),new Vector2(91,60),new Vector2(98,67),
            new Vector2(105,67),new Vector2(110,58),new Vector2(132,58),
            new Vector2(149,56),new Vector2(171,58),new Vector2(199,57),
            new Vector2(233,58),new Vector2(267,55),new Vector2(299,55),
            new Vector2(323,59),new Vector2(340,56),new Vector2(349,61),
            new Vector2(359,61),new Vector2(366,54),new Vector2(380,59),new Vector2(400,59)
        };
        static readonly Vector2[] PurpleHeader={
            new Vector2(0,67),new Vector2(21,66),new Vector2(30,73),
            new Vector2(44,75),new Vector2(58,71),new Vector2(69,62),
            new Vector2(80,61),new Vector2(92,68),new Vector2(101,66),
            new Vector2(109,59),new Vector2(132,59),new Vector2(162,58),
            new Vector2(204,60),new Vector2(248,60),new Vector2(291,59),
            new Vector2(320,62),new Vector2(341,59),new Vector2(352,65),
            new Vector2(362,59),new Vector2(381,60),new Vector2(400,60)
        };
        protected override void OnPopulateMesh(VertexHelper vh)
        {
            vh.Clear();
            var header=purple?PurpleHeader:RedHeader;
            for(int i=0;i<header.Length-1;i++)
                Quad(vh,new Vector2(header[i].x,0),new Vector2(header[i+1].x,0),header[i+1],header[i]);
            // Slightly irregular inner edges follow the relief instead of a straight crop.
            float[] y={53,80,108,139,168,199,230,259,286,313,342,377,413,451,489,518,535};
            float[] left={29,28,27,29,28,26,28,29,27,29,29,29,29,29,29,29,29};
            float[] right={371,373,374,372,374,373,371,373,374,371,371,371,371,371,371,371,371};
            for(int i=0;i<y.Length-1;i++)
            {
                Quad(vh,new Vector2(0,y[i]),new Vector2(left[i],y[i]),new Vector2(left[i+1],y[i+1]),new Vector2(0,y[i+1]));
                Quad(vh,new Vector2(right[i],y[i]),new Vector2(400,y[i]),new Vector2(400,y[i+1]),new Vector2(right[i+1],y[i+1]));
            }
            Quad(vh,new Vector2(0,535),new Vector2(400,535),new Vector2(400,560),new Vector2(0,560));
        }
        void Quad(VertexHelper vh,Vector2 a,Vector2 b,Vector2 c,Vector2 d)
        {
            int start=vh.currentVertCount;
            Vertex(vh,a);Vertex(vh,b);Vertex(vh,c);Vertex(vh,d);
            vh.AddTriangle(start,start+1,start+2);vh.AddTriangle(start,start+2,start+3);
        }
        void Vertex(VertexHelper vh,Vector2 p)
        {
            var r=rectTransform.rect;
            var position=new Vector3(r.xMin+p.x/400*r.width,r.yMax-p.y/560*r.height,0);
            var uv=new Vector2(sourceBounds.x+p.x/400*sourceBounds.width,
                sourceBounds.y+(1-p.y/560)*sourceBounds.height);
            vh.AddVert(position,color,uv);
        }
    }
}
