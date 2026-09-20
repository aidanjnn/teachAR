using UnityEngine;

namespace Trail.Runtime.Platform
{
    /// <summary>Owned URP font material. Keeps dynamic atlas updates without changing the shared font asset.</summary>
    [RequireComponent(typeof(TextMesh), typeof(MeshRenderer))]
    public sealed class WorldSpaceText : MonoBehaviour
    {
        private Font font;
        private Material material;
        public static void Configure(TextMesh text)
        {
            text.font = text.font != null ? text.font : Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var binding = text.GetComponent<WorldSpaceText>() ?? text.gameObject.AddComponent<WorldSpaceText>();
            binding.font = text.font;
            if (binding.material == null)
            {
                var shader = Resources.Load<Shader>("TrailText");
                if (shader == null) throw new System.InvalidOperationException("The URP world-space font shader is missing.");
                binding.material = new Material(shader) { name = "Trail world-space font", enableInstancing = true };
            }
            binding.Refresh(text.font);
            text.GetComponent<MeshRenderer>().sharedMaterial = binding.material;
        }
        private void Refresh(Font rebuilt)
        {
            if (rebuilt == font && material != null) material.mainTexture = font.material.mainTexture;
        }
        private void OnEnable() { Font.textureRebuilt += Refresh; if (font != null) Refresh(font); }
        private void OnDisable() => Font.textureRebuilt -= Refresh;
        private void OnDestroy() { if (material != null) Destroy(material); }
    }
}
