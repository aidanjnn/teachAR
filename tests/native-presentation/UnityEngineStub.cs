// HAND-WRITTEN COMPILE/RUN STUB. This is NOT Unity and does not reproduce Unity semantics
// (activation hierarchy, Destroy timing, serialization, rendering). It exists only to
// type-check and exercise Trail's own MonoBehaviour logic on a machine with no Unity editor.
// A green result here is NOT a Unity import, NOT a compile against real UnityEngine
// assemblies, NOT an EditMode/PlayMode run and NOT an APK build.
using System;
using System.Collections.Generic;
using System.Linq;

namespace UnityEngine
{
    public class Object
    {
        public string name = "";
        public static void Destroy(Object o) { }
        public static T Instantiate<T>(T original, Transform parent) where T : Object => original;
    }
    public class Component : Object
    {
        internal GameObject owner;
        public GameObject gameObject => owner;
        public Transform transform => owner.transform;
        public T GetComponent<T>() => owner.GetComponent<T>();
        public T GetComponentInChildren<T>() => owner.GetComponent<T>();
        public T GetComponentInChildren<T>(bool includeInactive) => owner.GetComponent<T>();
    }
    public class Behaviour : Component { public bool enabled = true; }
    public class MonoBehaviour : Behaviour { }
    public enum PrimitiveType { Sphere, Capsule, Cylinder, Cube, Plane, Quad }
    public class GameObject : Object
    {
        public readonly List<Component> Components = new List<Component>();
        public bool activeSelf = true;
        public Transform transform { get; }
        public GameObject() : this("GameObject") { }
        public GameObject(string label)
        {
            name = label;
            var root = new Transform { owner = this };
            Components.Add(root); transform = root;
        }
        public T AddComponent<T>() where T : Component
        {
            var component = (T)Activator.CreateInstance(typeof(T), true);
            component.owner = this; Components.Add(component); return component;
        }
        public T GetComponent<T>() => Components.OfType<T>().FirstOrDefault();
        public void SetActive(bool value) => activeSelf = value;
        public static GameObject CreatePrimitive(PrimitiveType type)
        {
            var shape = new GameObject(type.ToString());
            shape.AddComponent<BoxCollider>(); shape.AddComponent<MeshRenderer>();
            return shape;
        }
    }
    public class Transform : Component
    {
        public readonly List<Transform> Children = new List<Transform>();
        public Transform parent { get; private set; }
        public Vector3 position { get; set; }
        public Quaternion rotation { get; set; } = Quaternion.identity;
        public Vector3 localPosition { get; set; }
        public Vector3 localScale { get; set; } = Vector3.one;
        public void SetParent(Transform next) => SetParent(next, true);
        public void SetParent(Transform next, bool worldPositionStays)
        {
            if (parent != null) parent.Children.Remove(this);
            parent = next; if (next != null) next.Children.Add(this);
        }
        // The harness uses an identity tracking space so workspace maths stays exactly observable.
        public Vector3 TransformPoint(Vector3 point) => point;
    }
    public struct Vector3
    {
        public float x, y, z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero => new Vector3(0, 0, 0);
        public static Vector3 one => new Vector3(1, 1, 1);
        public static Vector3 up => new Vector3(0, 1, 0);
        public float sqrMagnitude => x * x + y * y + z * z;
        public float magnitude => (float)Math.Sqrt(sqrMagnitude);
        public Vector3 normalized { get { var m = magnitude; return m <= 0 ? zero : new Vector3(x / m, y / m, z / m); } }
        public static float Distance(Vector3 a, Vector3 b) => (a - b).magnitude;
        public static Vector3 operator +(Vector3 a, Vector3 b) => new Vector3(a.x + b.x, a.y + b.y, a.z + b.z);
        public static Vector3 operator -(Vector3 a, Vector3 b) => new Vector3(a.x - b.x, a.y - b.y, a.z - b.z);
        public static Vector3 operator *(Vector3 a, float f) => new Vector3(a.x * f, a.y * f, a.z * f);
        public static Vector3 operator *(float f, Vector3 a) => a * f;
        public override string ToString() => "(" + x + ", " + y + ", " + z + ")";
    }
    public struct Quaternion
    {
        public float x, y, z, w;
        public Quaternion(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Quaternion identity => new Quaternion(0, 0, 0, 1);
        public static Quaternion FromToRotation(Vector3 from, Vector3 to) => identity;
    }
    public struct Color
    {
        public float r, g, b, a;
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static Color white => new Color(1, 1, 1, 1);
        public static Color gray => new Color(.5f, .5f, .5f, 1);
    }
    public static class Mathf
    {
        public const float PI = 3.14159274f;
        public static float Cos(float f) => (float)Math.Cos(f);
        public static float Sin(float f) => (float)Math.Sin(f);
    }
    public class Shader : Object { }
    public class Material : Object
    {
        public readonly Dictionary<string, Color> Colors = new Dictionary<string, Color>();
        public Material(Shader shader) { }
        public void SetColor(string key, Color value) => Colors[key] = value;
    }
    public class Renderer : Component { public Material sharedMaterial { get; set; } }
    public class MeshRenderer : Renderer { }
    public class Collider : Component { }
    public class BoxCollider : Collider { }
    public class LineRenderer : Renderer
    {
        public bool useWorldSpace { get; set; }
        public bool loop { get; set; }
        public float widthMultiplier { get; set; }
        private Vector3[] points = new Vector3[0];
        public int positionCount
        {
            get => points.Length;
            set { var next = new Vector3[value]; Array.Copy(points, next, Math.Min(points.Length, value)); points = next; }
        }
        public Vector3 GetPosition(int index) => points[index];
        public void SetPosition(int index, Vector3 position) => points[index] = position;
        public void SetPositions(Vector3[] positions) => Array.Copy(positions, points, Math.Min(positions.Length, points.Length));
    }
    public enum TextAnchor { UpperLeft, MiddleLeft, MiddleCenter }
    public class Font : Object { public Material material { get; } = new Material(null); }
    public class TextMesh : Component
    {
        public int fontSize { get; set; }
        public float characterSize { get; set; }
        public TextAnchor anchor { get; set; }
        public Font font { get; set; }
        public Color color { get; set; }
        public string text { get; set; }
    }
    public static class Resources
    {
        public static T Load<T>(string path) where T : Object => (T)Activator.CreateInstance(typeof(T), true);
        public static T GetBuiltinResource<T>(string path) where T : Object => (T)Activator.CreateInstance(typeof(T), true);
    }
    public static class Debug { public static void LogWarning(object message) => Console.WriteLine("[warn] " + message); }
    public static class Application { public static string unityVersion => "stub-no-editor"; public static string persistentDataPath => "."; }
}
