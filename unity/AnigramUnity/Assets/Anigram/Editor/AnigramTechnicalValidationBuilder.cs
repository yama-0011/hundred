using System.IO;
using Hundred.Anigram;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Hundred.Anigram.Editor
{
    /// <summary>
    /// AnigramのWebGL技術検証用シーンを再現可能な形で生成する。
    /// </summary>
    public static class AnigramTechnicalValidationBuilder
    {
        private const string SceneDirectory = "Assets/Anigram/Scenes";
        private const string ScenePath = SceneDirectory + "/AnigramTechnicalValidation.unity";
        private const string WebGlOutputPath = "Builds/WebGL";

        [MenuItem("Anigram/技術検証シーンを作成")]
        public static void CreateScene()
        {
            Directory.CreateDirectory(SceneDirectory);

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            RenderSettings.ambientMode = AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(0.13f, 0.20f, 0.20f);
            RenderSettings.ambientEquatorColor = new Color(0.08f, 0.13f, 0.13f);
            RenderSettings.ambientGroundColor = new Color(0.04f, 0.07f, 0.07f);

            CreateCamera();
            CreateLight();
            CreateGround();
            CreatePlaceholderHedgehog();

            EditorSceneManager.SaveScene(scene, ScenePath);
            Selection.activeGameObject = GameObject.Find("AnigramPet");
            Debug.Log($"Anigram technical validation scene was created: {ScenePath}");
        }

        [MenuItem("Anigram/WebGL技術検証をビルド")]
        public static void BuildWebGl()
        {
            if (!File.Exists(ScenePath))
            {
                CreateScene();
            }

            // ViteとCloudflareの双方でContent-Encoding設定に依存せず読めるよう、
            // 技術検証ビルドではUnity側の事前圧縮を無効にする。
            PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;

            // 圧縮方式を変えた際に古い.brファイルが残らないよう、出力先だけを作り直す。
            if (Directory.Exists(WebGlOutputPath))
            {
                Directory.Delete(WebGlOutputPath, true);
            }

            Directory.CreateDirectory(WebGlOutputPath);
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = WebGlOutputPath,
                target = BuildTarget.WebGL,
                options = BuildOptions.None,
            };

            var report = BuildPipeline.BuildPlayer(options);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                throw new BuildFailedException(
                    $"Anigram WebGL build failed: {report.summary.result}");
            }

            Debug.Log($"Anigram WebGL build completed: {WebGlOutputPath}");
        }

        private static void CreateCamera()
        {
            var cameraObject = new GameObject("Main Camera");
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.025f, 0.055f, 0.052f);
            camera.fieldOfView = 34f;
            cameraObject.transform.SetPositionAndRotation(
                new Vector3(0f, 1.55f, -5.5f),
                Quaternion.Euler(8f, 0f, 0f));
        }

        private static void CreateLight()
        {
            var lightObject = new GameObject("Key Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.color = new Color(0.82f, 1f, 0.94f);
            light.intensity = 1.7f;
            lightObject.transform.rotation = Quaternion.Euler(48f, -32f, 0f);

            var fillObject = new GameObject("Fill Light");
            var fill = fillObject.AddComponent<Light>();
            fill.type = LightType.Point;
            fill.color = new Color(0.47f, 0.88f, 0.82f);
            fill.intensity = 5f;
            fill.range = 8f;
            fillObject.transform.position = new Vector3(-2f, 2f, -2f);
        }

        private static void CreateGround()
        {
            var ground = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            ground.name = "Ground";
            ground.transform.position = new Vector3(0f, -0.32f, 0f);
            ground.transform.localScale = new Vector3(2.4f, 0.08f, 2.4f);
            ApplyMaterial(ground, "Anigram Ground", new Color(0.08f, 0.14f, 0.13f));
        }

        private static void CreatePlaceholderHedgehog()
        {
            var root = new GameObject("AnigramPet");
            root.transform.position = Vector3.zero;

            var body = CreatePart(
                root.transform,
                "Body",
                PrimitiveType.Sphere,
                new Vector3(0f, 0.55f, 0f),
                new Vector3(1.55f, 1.05f, 1.1f),
                new Color(0.64f, 0.52f, 0.42f));

            var head = CreatePart(
                root.transform,
                "Head",
                PrimitiveType.Sphere,
                new Vector3(0f, 0.55f, -0.82f),
                new Vector3(0.78f, 0.72f, 0.92f),
                new Color(0.72f, 0.59f, 0.48f));

            CreatePart(
                head.transform,
                "Nose",
                PrimitiveType.Sphere,
                new Vector3(0f, -0.02f, -0.62f),
                Vector3.one * 0.22f,
                new Color(0.10f, 0.12f, 0.12f));

            CreatePart(
                head.transform,
                "Left Eye",
                PrimitiveType.Sphere,
                new Vector3(-0.24f, 0.15f, -0.40f),
                Vector3.one * 0.13f,
                new Color(0.02f, 0.025f, 0.025f));

            CreatePart(
                head.transform,
                "Right Eye",
                PrimitiveType.Sphere,
                new Vector3(0.24f, 0.15f, -0.40f),
                Vector3.one * 0.13f,
                new Color(0.02f, 0.025f, 0.025f));

            for (var index = -3; index <= 3; index += 1)
            {
                var spike = CreatePart(
                    body.transform,
                    $"Spike {index + 4}",
                    PrimitiveType.Capsule,
                    new Vector3(index * 0.16f, 0.58f, 0.18f),
                    new Vector3(0.09f, 0.28f, 0.09f),
                    new Color(0.36f, 0.29f, 0.25f));
                spike.transform.localRotation = Quaternion.Euler(-18f, 0f, index * -4f);
            }

            root.AddComponent<AnigramPetController>();
        }

        private static GameObject CreatePart(
            Transform parent,
            string name,
            PrimitiveType primitiveType,
            Vector3 localPosition,
            Vector3 localScale,
            Color color)
        {
            var part = GameObject.CreatePrimitive(primitiveType);
            part.name = name;
            part.transform.SetParent(parent, false);
            part.transform.localPosition = localPosition;
            part.transform.localScale = localScale;
            ApplyMaterial(part, $"Anigram {name}", color);
            return part;
        }

        private static void ApplyMaterial(GameObject target, string name, Color color)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit");
            var material = new Material(shader)
            {
                name = name,
                color = color,
            };
            target.GetComponent<Renderer>().sharedMaterial = material;
        }
    }
}
