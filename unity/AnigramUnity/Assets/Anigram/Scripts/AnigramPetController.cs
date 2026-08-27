using System;
using UnityEngine;

namespace Hundred.Anigram
{
    /// <summary>
    /// Workerから受け取る表示専用状態を、仮動物の見た目とモーションへ反映する。
    /// ゲーム状態の正本は保持せず、Unityは表示だけを担当する。
    /// </summary>
    public sealed class AnigramPetController : MonoBehaviour
    {
        [Serializable]
        private sealed class PetViewState
        {
            public float fullnessPercent = 50f;
            public string status = "alive";
            public string motion = "idle";
            public int evolutionStage = 1;
        }

        [SerializeField] private Color hungryColor = new(0.48f, 0.40f, 0.35f);
        [SerializeField] private Color normalColor = new(0.64f, 0.52f, 0.42f);
        [SerializeField] private Color fullColor = new(0.48f, 0.88f, 0.76f);
        [SerializeField] private Color deadColor = new(0.30f, 0.31f, 0.31f);

        private readonly PetViewState state = new();
        private Renderer[] petRenderers = Array.Empty<Renderer>();
        private Vector3 initialPosition;
        private Quaternion initialRotation;
        private Vector3 initialScale;

        private void Awake()
        {
            initialPosition = transform.position;
            initialRotation = transform.rotation;
            initialScale = transform.localScale;
            petRenderers = GetComponentsInChildren<Renderer>();
            ApplyVisualState();
        }

        private void Update()
        {
            if (IsDead())
            {
                return;
            }

            var speed = state.motion == "feed" ? 5f : 2f;
            var height = state.motion == "feed" ? 0.12f : 0.045f;
            var offset = Mathf.Sin(Time.time * speed) * height;
            transform.position = initialPosition + Vector3.up * offset;

            var pulse = 1f + Mathf.Sin(Time.time * speed) * 0.018f;
            transform.localScale = initialScale * pulse;
        }

        /// <summary>
        /// JavaScriptからSendMessageで呼び出し、表示状態を更新する。
        /// 例: {"fullnessPercent":80,"status":"alive","motion":"feed","evolutionStage":1}
        /// </summary>
        public void ApplyStateJson(string json)
        {
            if (string.IsNullOrWhiteSpace(json))
            {
                Debug.LogWarning("Anigram: empty pet state was ignored.");
                return;
            }

            try
            {
                JsonUtility.FromJsonOverwrite(json, state);
                state.fullnessPercent = Mathf.Clamp(state.fullnessPercent, 0f, 100f);
                ApplyVisualState();
            }
            catch (Exception exception)
            {
                Debug.LogWarning($"Anigram: invalid pet state was ignored. {exception.Message}");
            }
        }

        private void ApplyVisualState()
        {
            transform.position = initialPosition;
            transform.localScale = initialScale;
            transform.rotation = IsDead()
                ? initialRotation * Quaternion.Euler(0f, 0f, 82f)
                : initialRotation;

            var color = ResolveStateColor();
            foreach (var petRenderer in petRenderers)
            {
                foreach (var material in petRenderer.materials)
                {
                    material.color = color;
                }
            }
        }

        private Color ResolveStateColor()
        {
            if (IsDead())
            {
                return deadColor;
            }

            if (state.fullnessPercent <= 25f)
            {
                return hungryColor;
            }

            return state.fullnessPercent >= 80f ? fullColor : normalColor;
        }

        private bool IsDead()
        {
            return string.Equals(state.status, "dead", StringComparison.OrdinalIgnoreCase);
        }
    }
}
