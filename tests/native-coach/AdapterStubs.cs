// Only engine/transport boundaries are substituted. Guide and coach decision sources are real.
using System;
namespace UnityEngine
{
    public class MonoBehaviour { public Transform transform = new Transform(); }
    public sealed class Transform { public void SetParent(Transform parent, bool worldPositionStays) { } }
    public sealed class GameObject
    {
        public Transform transform = new Transform();
        public GameObject(string name) { }
        // Native composition is intentionally outside this portable harness.
        public T AddComponent<T>() => throw new NotSupportedException("Native audio composition requires Unity tests.");
    }
    public static class Application { public static bool isFocused = true; }
    public class DisallowMultipleComponent : Attribute { }
    public class SerializeField : Attribute { }
}
namespace Trail.Runtime.Record { public static class MotionClock { public static double NowMs => 0; } }
namespace Trail.Runtime.Guide { public class GuideController { public GuideSession Session; } }
namespace Trail.Runtime.Network
{
    public enum ConnectionState { Ready, Expired }
    public class NativeApiConnection
    {
        public ConnectionState State = ConnectionState.Ready;
        public event Action SessionInvalidated;
        public Action<long, string> Pending;
        public bool ExpireNext;
        public void Request(string method, string path, string body, Action<long, string> completed)
        {
            if (ExpireNext)
            {
                ExpireNext = false;
                // Same synchronous ordering as NativeApiConnection.Request -> Disconnect.
                State = ConnectionState.Expired;
                SessionInvalidated?.Invoke();
                completed(0, "");
            }
            else Pending = completed;
        }
    }
}

namespace Trail.Runtime.Coach
{
    // Compile-time names for the installer's native boundary, never exercised as fake working audio.
    public sealed class UnityCoachMicrophone : ICoachMicrophone
    {
        public bool Held => throw new NotSupportedException();
        public bool Capturing => throw new NotSupportedException();
        public bool AcquireMuted() => throw new NotSupportedException();
        public void SetCapturing(bool value) => throw new NotSupportedException();
        public void Release() => throw new NotSupportedException();
    }
    public sealed class UnityCoachTransport : ICoachTransport
    {
        public UnityCoachMicrophone Microphone;
        public event Action<string, string> Transcript { add => throw new NotSupportedException(); remove => throw new NotSupportedException(); }
        public event Action Closed { add => throw new NotSupportedException(); remove => throw new NotSupportedException(); }
        public bool Open => throw new NotSupportedException();
        public void CreateOffer(Action<string> offered, Action failed) => throw new NotSupportedException();
        public void AcceptAnswer(string sdp, Action connected, Action failed) => throw new NotSupportedException();
        public void Send(string json) => throw new NotSupportedException();
        public void SetOutputMuted(bool value) => throw new NotSupportedException();
        public void Close() => throw new NotSupportedException();
    }
}
