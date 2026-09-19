using System;
using System.Collections.Generic;
using Trail.Runtime.Platform;
using UnityEngine;
using UnityEngine.UI;

namespace Trail.Runtime.Network
{
    /// <summary>World-fixed head-direction dwell keyboard. No eye/hand tracking or guide control.</summary>
    public sealed class NativePairingPanel : MonoBehaviour
    {
        private sealed class Key { public RectTransform Rect; public Image Image; public Action Press; }
        private readonly List<Key> keys = new List<Key>();
        private readonly PairingInput input = new PairingInput();
        private PlatformContext context;
        private RectTransform panel;
        private GameObject keyboard;
        private Text status;
        private Text endpoint;
        private Text code;
        private Text hint;
        private Font font;
        private Key hovered;
        private float dwell;
        private bool latched;
        private bool placed;
        private float placeAfter;
        private string error = "";
        private static readonly Color Idle = new Color(0.12f, 0.17f, 0.22f, 0.98f);
        public void Initialize(PlatformContext value)
        {
            context = value;
            font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            var canvasObject = new GameObject("Native pairing setup", typeof(RectTransform), typeof(Canvas));
            canvasObject.transform.SetParent(context.Root.transform, false);
            panel = canvasObject.GetComponent<RectTransform>(); panel.sizeDelta = new Vector2(820, 780); panel.localScale = Vector3.one * 0.001f;
            var canvas = canvasObject.GetComponent<Canvas>(); canvas.renderMode = RenderMode.WorldSpace; canvas.worldCamera = context.HeadCamera;
            var background = canvasObject.AddComponent<Image>(); background.color = new Color(0.025f, 0.04f, 0.065f, 0.97f);
            Label(panel, "Trail · connection setup", 330, 34);
            hint = Label(panel, "Point your head at a key for 0.9 seconds. Look away between presses.", 286, 22);
            status = Label(panel, "Unpaired · get an author or learner code from desktop", 246, 23);
            AddKey(panel, "Setup", -285, 195, 170, () => SetKeyboard(true));
            AddKey(panel, "Recenter panel", 0, 195, 220, Place);
            AddKey(panel, "Disconnect", 285, 195, 190, () => { context.Connection.Disconnect(); input.ClearCode(); error = ""; SetKeyboard(true); });
            keyboard = new GameObject("Pairing keyboard", typeof(RectTransform)); keyboard.transform.SetParent(panel, false);
            var keyboardRect = keyboard.GetComponent<RectTransform>(); keyboardRect.sizeDelta = panel.sizeDelta;
            endpoint = Label(keyboardRect, "", 137, 22);
            code = Label(keyboardRect, "", 98, 22);
            AddKey(keyboardRect, "Edit endpoint", -280, 46, 220, () => { input.EditingCode = false; error = ""; });
            AddKey(keyboardRect, "Edit code", 0, 46, 200, () => { input.EditingCode = true; error = ""; });
            AddKey(keyboardRect, "Backspace", 280, 46, 210, () => input.Backspace());
            var rows = new[] { "1234567890", "qwertyuiop", "asdfghjkl", "zxcvbnm", ".:/-_[]" };
            for (var row = 0; row < rows.Length; row++)
            {
                var characters = rows[row];
                for (var col = 0; col < characters.Length; col++)
                {
                    var character = characters[col];
                    AddKey(keyboardRect, character.ToString(), (col - (characters.Length - 1) / 2f) * 76, -16 - row * 60, 68, () => input.Append(character));
                }
            }
            AddKey(keyboardRect, "HTTPS", -280, -333, 180, () => input.SelectHttps());
            AddKey(keyboardRect, Debug.isDebugBuild ? "USB dev :3001" : "USB unavailable", -40, -333, 245, () => { if (Debug.isDebugBuild) input.SelectUsb(true); else error = "USB requires a development APK and adb reverse"; });
            AddKey(keyboardRect, "Pair", 265, -333, 210, Submit);
            context.Connection.StateChanged += ConnectionChanged;
            placeAfter = Time.unscaledTime + 1f;
            Refresh();
        }
        private Text Label(Transform parent, string value, float y, int size)
        {
            var root = new GameObject("Label", typeof(RectTransform), typeof(Text)); root.transform.SetParent(parent, false);
            var rect = root.GetComponent<RectTransform>(); rect.sizeDelta = new Vector2(790, 45); rect.anchoredPosition = new Vector2(0, y);
            var text = root.GetComponent<Text>(); text.font = font; text.fontSize = size; text.alignment = TextAnchor.MiddleCenter; text.color = Color.white;
            text.horizontalOverflow = HorizontalWrapMode.Wrap; text.verticalOverflow = VerticalWrapMode.Truncate; text.text = value; return text;
        }
        private void AddKey(Transform parent, string label, float x, float y, float width, Action press)
        {
            var root = new GameObject("Key " + label, typeof(RectTransform), typeof(Image)); root.transform.SetParent(parent, false);
            var rect = root.GetComponent<RectTransform>(); rect.sizeDelta = new Vector2(width, 50); rect.anchoredPosition = new Vector2(x, y);
            var image = root.GetComponent<Image>(); image.color = Idle;
            var text = Label(rect, label, 0, 23); text.rectTransform.sizeDelta = rect.sizeDelta;
            keys.Add(new Key { Rect = rect, Image = image, Press = press });
        }
        private void Place()
        {
            var camera = context.HeadCamera.transform;
            panel.position = camera.position + camera.forward * 1.15f;
            panel.rotation = camera.rotation;
            placed = true;
        }
        private void SetKeyboard(bool visible) { keyboard.SetActive(visible); panel.GetComponent<Image>().enabled = visible; hint.text = visible ? "Head direction selects keys · dwell 0.9s · look away between presses" : "Paired · Setup opens endpoint and role-code entry"; }
        private void Submit()
        {
            try
            {
                var secret = input.TakeCode(Debug.isDebugBuild);
                context.Connection.Configure(input.Origin, input.UsbLoopback);
                context.Connection.Pair(secret); error = "";
            }
            catch (ArgumentException) { error = "Enter an HTTPS origin and eight-digit code; USB needs a development APK"; }
        }
        private void ConnectionChanged(ConnectionState state) { if (state == ConnectionState.Ready) SetKeyboard(false); Refresh(); }
        private void Refresh()
        {
            if (status == null) return;
            status.text = string.IsNullOrEmpty(error) ? context.Connection.State + (context.Connection.Role == null ? " · use a fresh desktop role code" : " · " + context.Connection.Role) : error;
            endpoint.text = (input.EditingCode ? "Endpoint: " : "Editing endpoint: ") + input.Origin;
            code.text = (input.EditingCode ? "Editing code: " : "Code: ") + new string('•', input.Code.Length) + " (" + input.Code.Length + "/8)";
        }
        private void Update()
        {
            if (context == null) return;
            if (!placed) { if (Time.unscaledTime >= placeAfter) Place(); else return; }
            var ray = context.HeadCamera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0));
            Key current = null;
            foreach (var key in keys)
            {
                if (!key.Rect.gameObject.activeInHierarchy) continue;
                var plane = new Plane(key.Rect.forward, key.Rect.position);
                if (plane.Raycast(ray, out var distance) && distance > 0 && distance < 3 && key.Rect.rect.Contains(key.Rect.InverseTransformPoint(ray.GetPoint(distance)))) { current = key; break; }
            }
            if (current != hovered)
            {
                if (hovered != null) hovered.Image.color = Idle;
                hovered = current; dwell = 0; latched = false;
            }
            if (current != null && !latched)
            {
                dwell += Time.unscaledDeltaTime;
                current.Image.color = Color.Lerp(Idle, new Color(0.12f, 0.65f, 0.58f, 1), Mathf.Clamp01(dwell / 0.9f));
                if (dwell >= 0.9f) { latched = true; current.Press(); Refresh(); }
            }
        }
        private void ResetInput() { input.ClearCode(); dwell = 0; latched = false; if (hovered != null) hovered.Image.color = Idle; hovered = null; Refresh(); }
        private void OnApplicationPause(bool paused) { if (paused) ResetInput(); }
        private void OnApplicationFocus(bool focused) { if (!focused) ResetInput(); }
        private void OnDestroy() { if (context != null) context.Connection.StateChanged -= ConnectionChanged; if (panel != null) Destroy(panel.gameObject); }
    }
}
