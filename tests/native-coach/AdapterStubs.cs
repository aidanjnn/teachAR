// Only engine/transport boundaries are substituted. Guide and coach decision sources are real.
using System;
namespace UnityEngine
{
    public class MonoBehaviour { }
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
