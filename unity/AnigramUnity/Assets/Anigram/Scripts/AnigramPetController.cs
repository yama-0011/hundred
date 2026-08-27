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
            public string species = "hedgehog";
            public string status = "alive";
            public string lifeStage = "egg";
            public string motion = "egg_idle";
            public string evolutionStage = "base";
            public float hatchProgressPercent = 0f;
            public float fullnessPercent = 0f;
        }

        [SerializeField] private Color hungryColor = new(0.48f, 0.40f, 0.35f);
        [SerializeField] private Color normalColor = new(0.64f, 0.52f, 0.42f);
        [SerializeField] private Color fullColor = new(0.48f, 0.88f, 0.76f);
        [SerializeField] private Color deadColor = new(0.30f, 0.31f, 0.31f);

        private readonly PetViewState state = new();
        private Renderer[] animalRenderers = Array.Empty<Renderer>();
        private GameObject eggVisual;
        private Renderer eggRenderer;
        private Vector3 initialPosition;
        private Quaternion initialRotation;
        private Vector3 initialScale;

        private void Awake()
        {
            initialPosition = transform.position;
            initialRotation = transform.rotation;
            initialScale = transform.localScale;
            animalRenderers = GetComponentsInChildren<Renderer>();
            CreateEggVisual();
            ApplyVisualState();
        }

        private void Update()
        {
            if (IsDead())
            {
                return;
            }

            if (IsBeforeHatching())
            {
                var hatching = string.Equals(
                    state.lifeStage,
                    "hatching",
                    StringComparison.OrdinalIgnoreCase);
                var eggSpeed = hatching ? 9f : 1.8f;
                var eggHeight = hatching ? 0.08f : 0.035f;
                transform.position = initialPosition
                    + Vector3.up * (Mathf.Sin(Time.time * eggSpeed) * eggHeight);
                transform.rotation = hatching
                    ? initialRotation * Quaternion.Euler(
                        0f,
                        0f,
                        Mathf.Sin(Time.time * eggSpeed) * 7f)
                    : initialRotation;
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
        /// 例: {"lifeStage":"baby","fullnessPercent":80,"status":"alive","motion":"feed"}
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
                state.hatchProgressPercent = Mathf.Clamp(state.hatchProgressPercent, 0f, 100f);
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
            var showEgg = IsBeforeHatching();
            if (eggVisual != null)
            {
                eggVisual.SetActive(showEgg);
            }
            foreach (var animalRenderer in animalRenderers)
            {
                animalRenderer.gameObject.SetActive(!showEgg);
            }
            transform.rotation = IsDead()
                ? initialRotation * Quaternion.Euler(0f, 0f, 82f)
                : initialRotation;

            if (showEgg)
            {
                ApplyEggColor();
                return;
            }

            var color = ResolveStateColor();
            foreach (var petRenderer in animalRenderers)
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

        private bool IsBeforeHatching()
        {
            return string.Equals(state.lifeStage, "egg", StringComparison.OrdinalIgnoreCase)
                || string.Equals(state.lifeStage, "hatching", StringComparison.OrdinalIgnoreCase);
        }

        private void CreateEggVisual()
        {
            eggVisual = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            eggVisual.name = "Egg";
            eggVisual.transform.SetParent(transform, false);
            eggVisual.transform.localPosition = new Vector3(0f, 0.52f, 0f);
            eggVisual.transform.localScale = new Vector3(0.92f, 1.25f, 0.92f);
            eggRenderer = eggVisual.GetComponent<Renderer>();

            var shader = Shader.Find("Universal Render Pipeline/Lit")
                ?? Shader.Find("Standard");
            eggRenderer.material = new Material(shader)
            {
                name = "Anigram Egg",
                color = new Color(0.82f, 0.78f, 0.64f),
            };

            var eggCollider = eggVisual.GetComponent<Collider>();
            if (eggCollider != null)
            {
                Destroy(eggCollider);
            }
        }

        private void ApplyEggColor()
        {
            if (eggRenderer == null)
            {
                return;
            }

            var progress = state.hatchProgressPercent / 100f;
            var baseColor = new Color(0.82f, 0.78f, 0.64f);
            var readyColor = new Color(0.48f, 0.88f, 0.76f);
            eggRenderer.material.color = Color.Lerp(baseColor, readyColor, progress * 0.55f);
        }
    }
}
