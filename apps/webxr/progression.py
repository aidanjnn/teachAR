"""Checkpoint evidence gate for a future Quest step controller; no pose inference."""
class CheckpointGate:
    def __init__(self):
        self.reset(None)

    def reset(self, context):
        self.context=context
        self.last_frame=None
        self.last_capture=None
        self.matches=0

    def observe(self, context, frame_id, captured, now, verdict):
        if context!=self.context:
            self.reset(context)
        if self.last_capture is not None and captured<=self.last_capture:
            return False  # Duplicate/out-of-order observations cannot add evidence.
        if verdict!='pass' or not 0<=now-captured<=12:
            self.reset(context)
            self.last_frame=frame_id
            self.last_capture=captured
            return False
        if frame_id==self.last_frame:
            return False
        if self.last_capture is None or captured-self.last_capture>20:
            self.matches=0
        self.matches+=1
        self.last_frame=frame_id
        self.last_capture=captured
        return self.matches>=2
