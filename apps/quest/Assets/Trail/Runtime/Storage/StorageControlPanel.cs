using System;
using Trail.Motion;
using Trail.Runtime.Platform;
using Trail.Runtime.Record;
using UnityEngine;

namespace Trail.Runtime.Storage
{
    public sealed class StorageControlPanel : MonoBehaviour, IDiagnosticPanel
    {
        // The learner-facing shell hides engineering panels unless Settings asks for them.
        // Deactivating also unsubscribes through OnDisable, so a hidden panel observes nothing.
        public void SetPanelVisible(bool visible) => gameObject.SetActive(visible);

        public NativeStorageFeature Storage;
        private TextMesh status;
        private readonly TextMesh[] buttons = new TextMesh[4];
        private readonly string[] labels = { "Upload saved recording", "Refresh ready guides", "Next guide", "Preload selected guide" };
        private HandObservationSource source;
        private int touching=-1;
        private double started,lastSeen=-1;
        private long lastSequence=-1;
        private bool latched;
        private void Start()
        {
            status=Label("Storage status",new Vector3(0,.14f,0),.006f);
            for(var i=0;i<labels.Length;i++)buttons[i]=Label(labels[i],new Vector3(0,-i*.06f,0),.008f);
        }
        private TextMesh Label(string text,Vector3 position,float size)
        {
            var child=new GameObject(text); child.transform.SetParent(transform,false); child.transform.localPosition=position;
            var label=child.AddComponent<TextMesh>(); label.text="● "+text; label.fontSize=48; label.characterSize=size; label.anchor=TextAnchor.MiddleLeft; label.color=Color.white; return label;
        }
        private void Update()
        {
            if(Storage==null || status==null)return;
            status.text=Storage.Status+"\nSelected: "+Storage.SelectedTitle;
            var next=Storage.Capture==null?null:Storage.Capture.Source;
            if(next!=source) { Unsubscribe(); source=next; if(source!=null)source.Observed+=Observe; }
            if(MotionClock.NowMs-lastSeen>100)ResetTouch();
        }
        private void Observe(ReferenceObservation sample)
        {
            if(source==null || source.TrackingSpace==null || buttons[0]==null || sample.Sequence<=lastSequence || sample.TimestampMs<=lastSeen || sample.OriginRevision!=source.OriginRevision || MotionClock.NowMs-sample.TimestampMs>100) { ResetTouch(); return; }
            if(sample.TimestampMs-lastSeen>100)ResetTouch(); lastSeen=sample.TimestampMs; lastSequence=sample.Sequence;
            var hand=Storage.Capture.UseLeftHand?sample.Right:sample.Left;
            if(hand==null || hand.Status!="valid" || !hand.Joints.TryGetValue("index-finger-tip",out var tip)) { ResetTouch(); return; }
            var p=tip.PositionM; var world=source.TrackingSpace.TransformPoint(new Vector3(p.X,p.Y,-p.Z)); var selected=-1;
            for(var i=0;i<buttons.Length;i++)if(Vector3.Distance(world,buttons[i].transform.position)<.025f) { selected=i;break; }
            if(selected<0) { ResetTouch();return; }
            if(touching!=selected) { touching=selected;started=sample.TimestampMs;latched=false; }
            if(latched || sample.TimestampMs-started<600)return;
            latched=true;
            switch(selected) { case 0:Storage.UploadLastCapture();break;case 1:Storage.RefreshLibrary();break;case 2:Storage.NextGuide();break;case 3:Storage.PreloadSelected();break; }
        }
        private void ResetTouch() { touching=-1;latched=false; }
        private void Unsubscribe() { if(source!=null)source.Observed-=Observe;source=null;lastSequence=-1;lastSeen=-1;ResetTouch(); }
        private void OnDisable()=>Unsubscribe();
    }
}
