import base64
import json
import itertools
import sys
import threading
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server
from vision import verify, validate_boxes

BOXES = [[70,180,140,170],[300,180,140,170],[530,180,140,170]]


def scene(order=(0,1,2)):
    rng=np.random.default_rng(45)
    image=np.full((480,760,3),65,np.uint8)
    # Deterministic textured static backdrop, deliberately unlike real photos.
    for _ in range(300):
        x,y=rng.integers([0,0],[760,480]);c=int(rng.integers(95,180))
        cv2.circle(image,(int(x),int(y)),int(rng.integers(1,5)),(c,c,c),-1)
    colors=[(220,235,240),(30,110,230),(190,60,130)]
    for index,(x,y,w,h) in enumerate(BOXES):
        image[y:y+h,x:x+w]=55
        toy=order[index]
        # Stationary, individually textured tissue destinations, never moved
        # with the toys. Random texture stands in for paper creases and writing.
        paper=np.full((95,w,3),210,np.uint8)
        prng=np.random.default_rng(200+index)
        for _ in range(70):
            px,py=prng.integers([5,5],[w-5,90]);color=int(prng.integers(30,170))
            cv2.circle(paper,(int(px),int(py)),2,(color,color,color),-1)
        image[y+h:y+h+95,x:x+w]=paper
        if toy is None:continue
        cv2.rectangle(image,(x+15,y+12),(x+w-15,y+h-12),colors[toy],-1)
        cv2.circle(image,(x+42,y+50),9,(5,5,5),-1)
        cv2.circle(image,(x+90,y+50),9,(5,5,5),-1)
        trng=np.random.default_rng(800+toy)
        for _ in range(60):
            px,py=trng.integers([20,18],[w-20,h-18]);color=int(trng.integers(15,180))
            cv2.circle(image,(int(x+px),int(y+py)),2,(color,color,color),-1)
        cv2.putText(image,str(toy),(x+42,y+128),cv2.FONT_HERSHEY_SIMPLEX,1.4,(15,15,15),3)
    return image


class VisionTests(unittest.TestCase):
    def test_correct_scene_passes(self):
        self.assertEqual(verify(scene(),scene(),BOXES)['verdict'],'pass')

    def test_swap_is_rejected_and_identified(self):
        answer=verify(scene(),scene((2,1,0)),BOXES)
        self.assertEqual(answer['verdict'],'fail')
        self.assertEqual(answer['slots'][0]['observed'],'square')
        self.assertEqual(answer['slots'][2]['observed'],'goose')

    def test_missing_plushie_never_passes(self):
        self.assertNotEqual(verify(scene(),scene((None,1,2)),BOXES)['verdict'],'pass')

    def test_occluded_plushie_is_uncertain(self):
        current=scene();current[180:350,70:210]=(80,155,190)
        self.assertEqual(verify(scene(),current,BOXES)['verdict'],'unknown')

    def test_small_camera_shift_is_aligned(self):
        shifted=cv2.warpAffine(scene(),np.float32([[1,0,9],[0,1,-7]]),(760,480))
        self.assertEqual(verify(scene(),shifted,BOXES)['verdict'],'pass')

    def test_new_view_is_uncertain(self):
        unrelated=np.random.default_rng(3).integers(0,255,(480,760,3),dtype=np.uint8)
        self.assertEqual(verify(scene(),unrelated,BOXES)['verdict'],'unknown')

    def test_duplicate_identity_is_uncertain(self):
        self.assertEqual(verify(scene(),scene((0,0,2)),BOXES)['verdict'],'unknown')

    def test_every_permutation_under_perspective(self):
        matrix=cv2.getPerspectiveTransform(np.float32([[0,0],[760,0],[760,480],[0,480]]),
            np.float32([[45,25],[700,5],[740,455],[20,470]]))
        for order in itertools.permutations(range(3)):
            with self.subTest(order=order):
                current=cv2.warpPerspective(scene(order),matrix,(760,480))
                result=verify(scene(),current,BOXES)
                self.assertEqual(result['verdict'],'pass' if order==(0,1,2) else 'fail',result)
                self.assertEqual([r['observed'] for r in result['slots']],
                                 [['goose','fox','square'][i] for i in order])

    def test_covered_destination_cannot_pass(self):
        current=scene();current[350:460,50:230]=30
        self.assertEqual(verify(scene(),current,BOXES)['verdict'],'unknown')

    def test_moved_tissue_alone_cannot_pass(self):
        current=scene();current[350:460,50:230]=30
        current[15:110,70:210]=scene()[350:445,70:210]
        self.assertEqual(verify(scene(),current,BOXES)['verdict'],'unknown')

    def test_background_change_does_not_block_objects(self):
        current=scene();current[:165,:]=5
        self.assertEqual(verify(scene(),current,BOXES)['verdict'],'pass')

    def test_resized_camera_image(self):
        current=cv2.resize(scene(),(950,600))
        self.assertEqual(verify(scene(),current,BOXES)['verdict'],'pass')

    def test_invalid_and_overlapping_boxes_rejected(self):
        for boxes in [[], [[0,0,10,10]]*3, [BOXES[0]]*3]:
            with self.assertRaises(ValueError):validate_boxes(boxes,scene().shape)


class StateTests(unittest.TestCase):
    def setUp(self):
        with server.LOCK:
            server.STATE.update(reference=scene(),frame=scene(),boxes=BOXES,revision=1,frame_id=1,received=time.monotonic(),result=None)

    def test_stale_frame_never_passes(self):
        server.STATE['received']=time.monotonic()-4
        with self.assertRaisesRegex(ValueError,'fresh'):server.inspect_current()

    def test_reference_changed_during_check_rejects_result(self):
        def delayed(*args):
            server.STATE['revision']+=1
            return {'verdict':'pass'}
        with patch.object(server,'verify',delayed):
            with self.assertRaisesRegex(ValueError,'outdated'):server.inspect_current()
        self.assertIsNone(server.STATE['result'])

    def test_inference_expiring_frame_rejects_result(self):
        with patch.object(server,'verify',return_value={'verdict':'pass'}),patch.object(server.time,'monotonic',side_effect=[server.STATE['received'],server.STATE['received']+4]):
            with self.assertRaisesRegex(ValueError,'outdated'):server.inspect_current()


class HTTPTests(unittest.TestCase):
    def setUp(self):
        self.post('/api/source',{'source_kind':'upload'})

    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        root=Path(cls.temp.name)
        (root/'public').symlink_to(server.ROOT/'public',target_is_directory=True)
        cls.root_patch=patch.object(server,'ROOT',root);cls.root_patch.start()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.http.server_port}'

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join()
        cls.root_patch.stop();cls.temp.cleanup()

    def test_ar_and_vendored_modules_served(self):
        for path in ['/hands','/motion-core.mjs','/hand-guide.mjs','/ar','/ar.js','/ar-state.mjs','/ar.css','/vendor/three.module.js','/vendor/three.core.js']:
            with self.subTest(path=path),urllib.request.urlopen(self.base+path) as response:
                self.assertEqual(response.status,200)
                if path.endswith(('.js','.mjs')):self.assertIn('text/javascript',response.headers['Content-Type'])
                self.assertTrue(response.read())

    def test_reference_cache_restores_setup_but_not_live_frame(self):
        self.upload(scene());self.post('/api/reference',{})
        self.post('/api/boxes',{'boxes':BOXES,'revision':server.STATE['revision']})
        self.assertTrue((server.ROOT/'.runtime/reference-cache.json').exists())
        server.restore_reference_cache()
        self.assertIsNotNone(server.STATE['reference'])
        self.assertEqual(server.STATE['boxes'],BOXES)
        self.assertIsNone(server.STATE['frame'])
        self.assertFalse(server.ai_ready())

    def test_status_contains_age_and_capture_without_secret(self):
        self.upload(scene())
        latest={'revision':server.STATE['revision'],'verdict':'pass','frame_id':1,
                'captured_at_unix_ms':round(time.time()*1000)-3000,'message':'test','slots':[]}
        with patch.object(server,'AI_LATEST',latest):
            with urllib.request.urlopen(self.base+'/api/ai/status') as response:status=json.load(response)
        self.assertGreaterEqual(status['latest']['age_ms'],3000)
        self.assertNotIn('age_ms',latest)
        self.assertEqual(status['capture']['source'],'upload')

    def post(self,path,body,origin=None):
        headers={'Content-Type':'application/json'}
        if origin:headers['Origin']=origin
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode(),headers=headers)
        with urllib.request.urlopen(req) as response:return json.load(response)

    def upload(self,image):
        data=base64.b64encode(cv2.imencode('.jpg',image)[1]).decode()
        return self.post('/api/frame',{'image':data,'source':'upload'})

    def test_reference_box_and_swap_flow(self):
        self.upload(scene());self.post('/api/reference',{})
        with urllib.request.urlopen(self.base+'/api/state') as response:state=json.load(response)
        self.post('/api/boxes',{'boxes':BOXES,'revision':state['revision']})
        self.assertEqual(self.post('/api/check',{})['verdict'],'pass')
        self.upload(scene((2,1,0)))
        self.assertEqual(self.post('/api/check',{})['verdict'],'fail')

    def test_cross_origin_write_rejected(self):
        with self.assertRaises(urllib.error.HTTPError) as result:self.post('/api/reference',{},'https://unrelated.invalid')
        self.assertEqual(result.exception.code,403)

    def test_ai_requires_local_request_token(self):
        with self.assertRaises(urllib.error.HTTPError) as result:self.post('/api/ai/check',{})
        self.assertEqual(result.exception.code,403)

    def test_rebinding_host_rejected(self):
        req=urllib.request.Request(self.base+'/api/ai/status',headers={'Host':'unrelated.invalid'})
        with self.assertRaises(urllib.error.HTTPError) as result:urllib.request.urlopen(req)
        self.assertEqual(result.exception.code,403)

    def test_old_box_edit_rejected(self):
        self.upload(scene());self.post('/api/reference',{})
        with self.assertRaises(urllib.error.HTTPError):self.post('/api/boxes',{'boxes':BOXES,'revision':-1})

    def test_laptop_cannot_overwrite_selected_quest_feed(self):
        self.post('/api/source',{'source_kind':'quest'})
        data=base64.b64encode(cv2.imencode('.jpg',scene())[1]).decode()
        quest=urllib.request.Request(self.base+'/api/frame',data=json.dumps({'image':data,'source':'camera'}).encode(),headers={'Content-Type':'application/json','User-Agent':'OculusBrowser/40.1'})
        with urllib.request.urlopen(quest) as response:accepted=json.load(response)
        with self.assertRaises(urllib.error.HTTPError) as rejected:
            self.post('/api/frame',{'image':data,'source':'camera'})
        self.assertEqual(rejected.exception.code,409)
        with urllib.request.urlopen(self.base+'/api/state') as response:state=json.load(response)
        self.assertEqual(state['frame_id'],accepted['frame_id'])
        self.assertEqual(state['source'],'Quest headset camera')

    def test_source_switch_invalidates_reference(self):
        self.upload(scene());self.post('/api/reference',{})
        self.post('/api/source',{'source_kind':'quest'})
        with urllib.request.urlopen(self.base+'/api/state') as response:state=json.load(response)
        self.assertFalse(state['has_reference'])
        self.assertIsNone(state['shape'])


if __name__=='__main__':unittest.main()
