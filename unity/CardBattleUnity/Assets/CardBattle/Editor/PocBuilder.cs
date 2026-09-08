using System.IO;
using Hundred.CardBattle;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;

public static class PocBuilder
{
    const string Scene = "Assets/CardBattle/SummonPoc.unity";
    [MenuItem("Card Battle/Create PoC Scene")]
    public static void CreateScene()
    {
        CardQualityAssets.Ensure();
        EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
        var camera = new GameObject("Camera").AddComponent<Camera>();
        camera.clearFlags = CameraClearFlags.SolidColor;
        camera.backgroundColor = new Color(.055f,.085f,.12f);
        new GameObject("SummonPoC").AddComponent<SummonPoc>();
        EditorSceneManager.SaveScene(UnityEngine.SceneManagement.SceneManager.GetActiveScene(), Scene);
        PlayerSettings.companyName = "Hundred";
        PlayerSettings.productName = "Card Battle Summon PoC";
        PlayerSettings.insecureHttpOption = InsecureHttpOption.AlwaysAllowed;
        PlayerSettings.defaultWebScreenWidth = 1200;
        PlayerSettings.defaultWebScreenHeight = 760;
        AssetDatabase.SaveAssets();
    }
    [MenuItem("Card Battle/Build WebGL PoC")]
    public static void BuildWebGl()
    {
        CreateScene();
        PlayerSettings.WebGL.compressionFormat = WebGLCompressionFormat.Disabled;
        PlayerSettings.WebGL.template = "PROJECT:HundredViewport";
        var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { Scene }, locationPathName = "Builds/WebGL", target = BuildTarget.WebGL, options = BuildOptions.Development });
        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) throw new BuildFailedException(report.summary.result.ToString());
    }
}
