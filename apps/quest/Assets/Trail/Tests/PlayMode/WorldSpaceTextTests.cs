using System.Collections;
using NUnit.Framework;
using Trail.Runtime.Platform;
using UnityEngine;
using UnityEngine.TestTools;

namespace Trail.Tests
{
    public sealed class WorldSpaceTextTests
    {
        [UnityTest]
        public IEnumerator FontAtlasUsesOwnedUrpMaterialAndReleasesIt()
        {
            var root = new GameObject("World-space control");
            var text = root.AddComponent<TextMesh>(); text.text = "Record / Pause / Resume";
            WorldSpaceText.Configure(text);
            var material = root.GetComponent<MeshRenderer>().sharedMaterial;
            var shared = text.font.material;
            Assert.AreEqual("Trail/WorldSpaceText", material.shader.name);
            Assert.AreNotSame(shared, material);
            text.font.RequestCharactersInTexture("Camera, microphone and calibration", 48);
            yield return null;
            Assert.AreSame(text.font.material.mainTexture, material.mainTexture);
            WorldSpaceText.Configure(text);
            Assert.AreSame(material, root.GetComponent<MeshRenderer>().sharedMaterial);
            Object.Destroy(root); yield return null; yield return null;
            Assert.IsTrue(material == null);
            Assert.IsTrue(shared != null);
        }
    }
}
