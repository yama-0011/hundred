using System;
using UnityEngine;

namespace Hundred.CardBattle.Presentation
{
    // Read-only appearance fixture for the quality study. Never used by the battle rules.
    [Serializable] public sealed class CardFaceData
    {
        public string cardId, name, englishName, tribe, attribute, imageResource, effectHeading, effectText, flavor;
        public int cost;
        public CardFaceLevel[] levels;
        public float focalX = .5f, focalY = .5f, zoom = 1f;
    }
    [Serializable] public sealed class CardFaceLevel { public int level, requiredCores, bp; }
    public enum CardDisplaySize { Detail, Hand, Field }

    public sealed class CardTheme
    {
        public Color Accent, Dark, Light;
        public static CardTheme For(string attribute)
        {
            string accent;
            switch(attribute)
            {
                case "PURPLE":accent="8B69AF";break;
                case "GREEN":accent="4B9562";break;
                case "WHITE":accent="C9D4DC";break;
                case "YELLOW":accent="D6B650";break;
                case "BLUE":accent="497EA8";break;
                default:accent="B6523E";break;
            }
            var color=CardUi.Hex(accent);
            return new CardTheme {Accent=color,Dark=Color.Lerp(Color.black,color,.35f),Light=Color.Lerp(color,Color.white,.5f)};
        }
    }
}
