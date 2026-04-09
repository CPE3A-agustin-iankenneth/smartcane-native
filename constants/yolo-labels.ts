/**
 * COCO 80-class label list matching YOLOv8 Nano's class indices.
 * Index 0 = 'person', index 79 = 'toothbrush'.
 */
export const COCO_LABELS: string[] = [
  'person', 'bicycle', 'car', 'motorcycle', 'airplane', 'bus', 'train',
  'truck', 'boat', 'traffic light', 'fire hydrant', 'stop sign',
  'parking meter', 'bench', 'bird', 'cat', 'dog', 'horse', 'sheep', 'cow',
  'elephant', 'bear', 'zebra', 'giraffe', 'backpack', 'umbrella', 'handbag',
  'tie', 'suitcase', 'frisbee', 'skis', 'snowboard', 'sports ball', 'kite',
  'baseball bat', 'baseball glove', 'skateboard', 'surfboard', 'tennis racket',
  'bottle', 'wine glass', 'cup', 'fork', 'knife', 'spoon', 'bowl', 'banana',
  'apple', 'sandwich', 'orange', 'broccoli', 'carrot', 'hot dog', 'pizza',
  'donut', 'cake', 'chair', 'couch', 'potted plant', 'bed', 'dining table',
  'toilet', 'tv', 'laptop', 'mouse', 'remote', 'keyboard', 'cell phone',
  'microwave', 'oven', 'toaster', 'sink', 'refrigerator', 'book', 'clock',
  'vase', 'scissors', 'teddy bear', 'hair drier', 'toothbrush',
];

/**
 * Subset of COCO indices that represent real-world navigation obstacles.
 * Anything not in this set is ignored by the vision loop.
 */
export const OBSTACLE_CLASS_INDICES = new Set<number>([
  0,  // person
  1,  // bicycle
  2,  // car
  3,  // motorcycle
  5,  // bus
  6,  // train
  7,  // truck
  9,  // traffic light
  10, // fire hydrant
  11, // stop sign
  13, // bench
  56, // chair
  57, // couch
  58, // potted plant
  59, // bed
  60, // dining table
  62, // tv
  63, // laptop
]);
