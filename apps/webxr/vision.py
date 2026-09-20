"""Local appearance matching. No semantic model and no hardware accuracy claim."""
import cv2
import numpy as np

NAMES = ["goose", "fox", "square"]
SLOTS = ["A", "B", "C"]


def validate_boxes(boxes, shape):
    h, w = shape[:2]
    if not isinstance(boxes, list) or len(boxes) != 3:
        raise ValueError("Mark exactly three boxes: goose/A, fox/B, square/C.")
    result = []
    for box in boxes:
        if not isinstance(box, list) or len(box) != 4 or not all(type(v) is int for v in box):
            raise ValueError("Boxes must contain four integer coordinates.")
        x, y, bw, bh = box
        if bw < 30 or bh < 30 or x < 0 or y < 0 or x+bw > w or y+bh > h:
            raise ValueError("Each plushie box must be inside the image and at least 30 pixels wide/high.")
        for px, py, pw, ph in result:
            if min(x+bw, px+pw) > max(x, px) and min(y+bh, py+ph) > max(y, py):
                raise ValueError("Plushie boxes must not overlap.")
        result.append(box)
    return result


def crop(image, box):
    x, y, w, h = box
    return image[y:y+h, x:x+w]


def label_boxes(boxes, shape):
    """Tissues immediately below the toy boxes are stationary destination anchors."""
    height, width = shape[:2]
    regions = []
    for x, y, w, h in boxes:
        left, top = max(0, x-20), y+h
        regions.append([left, top, min(width, x+w+20)-left, min(height-top, round(h*.65))])
    return regions


def features(image, mask=None):
    return cv2.SIFT_create(nfeatures=5000, contrastThreshold=.015).detectAndCompute(
        cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), mask)


def locate(reference, box, current_features, current_shape, toy=False):
    x, y, w, h = box
    if min(w, h) < 20:
        return None
    patch = crop(reference, box)
    mask = None
    if toy:
        # Avoid matching stationary table edges just inside a loose toy box.
        mask = np.zeros((h,w), np.uint8)
        cv2.ellipse(mask, (w//2,h//2), (round(w*.46),round(h*.48)), 0,0,360,255,-1)
    keys, desc = features(patch, mask)
    live_keys, live_desc = current_features
    if desc is None or live_desc is None or len(live_desc)<2:
        return None
    pairs = cv2.BFMatcher().knnMatch(desc, live_desc, k=2)
    matches = [a for a,b in pairs if a.distance < .72*b.distance]
    # SIFT can assign several orientations to one physical feature. Do not count
    # those as independent evidence, or let many reference points reuse one match.
    distinct, seen_ref, seen_live = [], set(), set()
    for match in sorted(matches, key=lambda m:m.distance):
        rp=tuple(round(v) for v in keys[match.queryIdx].pt)
        cp=tuple(round(v) for v in live_keys[match.trainIdx].pt)
        if rp not in seen_ref and cp not in seen_live:
            distinct.append(match);seen_ref.add(rp);seen_live.add(cp)
    if len(distinct)<6:
        return None
    r = np.float32([keys[m.queryIdx].pt for m in distinct])
    c = np.float32([live_keys[m.trainIdx].pt for m in distinct])
    matrix, inliers = cv2.estimateAffinePartial2D(r,c,method=cv2.RANSAC,ransacReprojThreshold=4)
    if matrix is None or inliers is None:
        return None
    good = inliers.ravel().astype(bool)
    count = int(good.sum())
    span = np.ptp(r[good], axis=0) if count else np.zeros(2)
    scale = float(np.hypot(matrix[0,0],matrix[1,0]))
    if count<6 or count/len(distinct)<.4 or not .35<scale<2.5 or span[0]<w*.18 or span[1]<h*.18:
        return None
    corners = cv2.transform(np.float32([[[0,0],[w,0],[w,h],[0,h]]]),matrix)[0]
    ch,cw=current_shape[:2]
    if np.any(corners[:,0]<-10) or np.any(corners[:,0]>cw+10) or np.any(corners[:,1]<-10) or np.any(corners[:,1]>ch+10):
        return None
    center = cv2.transform(np.float32([[[w/2,h/2]]]),matrix)[0,0]
    return dict(center=center, polygon=corners, inliers=count,
                reference_points=r[good]+[x,y], current_points=c[good])


def verify(reference, current, boxes):
    boxes=validate_boxes(boxes,reference.shape)
    anchors=label_boxes(boxes,reference.shape)
    live_features=features(current)
    toys=[locate(reference,b,live_features,current.shape,toy=True) for b in boxes]
    labels=[locate(reference,b,live_features,current.shape) for b in anchors]
    detections=[]
    for kind, names, found in [('toy',NAMES,toys),('destination',SLOTS,labels)]:
        for name,item in zip(names,found):
            if item:
                detections.append(dict(kind=kind,name=name,center=item['center'].round(1).tolist(),
                    polygon=item['polygon'].round(1).tolist(),inliers=item['inliers']))
    alignment={'method':'individual SIFT features + tissue anchors'}
    def answer(verdict,message,rows=None):
        return dict(verdict=verdict,message=message,slots=rows or [],alignment=alignment,
                    detections=detections,label_boxes=anchors, image_size=[current.shape[1],current.shape[0]])
    missing_labels=[name for name,item in zip(SLOTS,labels) if item is None]
    if missing_labels:
        return answer('unknown','Cannot locate destination '+', '.join(missing_labels)+'. Keep the labeled tissues visible, flat, and stationary. Dashed reference boxes must cover the tissues.')
    # The workspace transform uses only stationary tissue features, never toys.
    r=np.float32(np.concatenate([item['reference_points'] for item in labels]))
    c=np.float32(np.concatenate([item['current_points'] for item in labels]))
    homography,inliers=cv2.findHomography(c,r,cv2.RANSAC,4)
    if homography is None or inliers is None or not np.isfinite(homography).all():
        return answer('unknown','Destination geometry is unclear. Show all three tissues.')
    good=inliers.ravel().astype(bool)
    start=0
    for item in labels:
        end=start+item['inliers']
        if np.count_nonzero(good[start:end])<4:
            return answer('unknown','The tissue matches disagree. Clear the labels and use a less oblique view.')
        start=end
    # Reject a fold, a near-singular mapping, or extreme perspective extrapolation.
    hh,ww=current.shape[:2]
    frame=np.float32([[[0,0],[ww,0],[ww,hh],[0,hh]]])
    warped=cv2.perspectiveTransform(frame,homography)[0]
    if not np.isfinite(warped).all() or not cv2.isContourConvex(warped):
        return answer('unknown','View is too oblique for reliable destination geometry.')
    alignment['inliers']=int(good.sum())
    missing=[name for name,item in zip(NAMES,toys) if item is None]
    if missing:
        return answer('unknown','Cannot recognize '+', '.join(missing)+'. Clear your hands and show the learned side of each toy; a new side needs a new reference.')
    centers=cv2.perspectiveTransform(np.float32([[t['center'] for t in toys]]),homography)[0]
    targets=np.float32([[x+w/2,y+h/2] for x,y,w,h in boxes])
    # Assign each individually recognized toy to a destination; no assumption
    # that A is leftmost, or that objects have remained in their original boxes.
    costs=np.linalg.norm(centers[:,None,:]-targets[None,:,:],axis=2)
    assigned=[]
    for index,row in enumerate(costs):
        order=np.argsort(row);best,second=int(order[0]),int(order[1])
        spacing=min(np.linalg.norm(targets[best]-targets[j]) for j in range(3) if j!=best)
        radius=min(max(boxes[best][2:])*.65,spacing*.42)
        if row[best]>radius or row[second]-row[best]<spacing*.2:
            return answer('unknown',NAMES[index]+' is between destinations or outside the supported viewpoint. Put it clearly behind one tissue.')
        assigned.append(best)
    if len(set(assigned))!=3:
        return answer('unknown','Object locations overlap or repeat. Separate the toys and clear the view.')
    rows=[]
    for slot in range(3):
        observed=assigned.index(slot)
        rows.append(dict(slot=SLOTS[slot],expected=NAMES[slot],observed=NAMES[observed],
                         status='match' if observed==slot else 'wrong'))
    wrong=[r for r in rows if r['status']=='wrong']
    if wrong:
        return answer('fail',' '.join(f"Move {r['observed']} away from {r['slot']}; {r['expected']} belongs there." for r in wrong),rows)
    return answer('pass','Visual evidence matches: goose at A, fox at B, square at C.',rows)
