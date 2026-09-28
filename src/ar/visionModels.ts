import { FaceLandmarker, FilesetResolver, ImageSegmenter } from '@mediapipe/tasks-vision';
import { config } from '../lib/config';

export interface VisionModels {
  segmenter: ImageSegmenter | null;
  face: FaceLandmarker | null;
  errors: string[];
}

let pending: Promise<VisionModels> | null = null;

async function withGpuFallback<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU');
  } catch (gpuError) {
    console.warn('[ar] GPU delegate failed, retrying on CPU', gpuError);
    return create('CPU');
  }
}

/** Loads both MediaPipe tasks once per page. Either may be null if it failed. */
export function loadVisionModels(): Promise<VisionModels> {
  pending ??= (async () => {
    const errors: string[] = [];
    const fileset = await FilesetResolver.forVisionTasks(config.mediapipeWasmBase);
    const [segmenter, face] = await Promise.all([
      withGpuFallback((delegate) =>
        ImageSegmenter.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: config.segmenterModelUrl, delegate },
          runningMode: 'VIDEO',
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        }),
      ).catch((e: unknown) => {
        errors.push(`Background segmentation unavailable: ${String(e)}`);
        return null;
      }),
      withGpuFallback((delegate) =>
        FaceLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: config.faceModelUrl, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: false,
          outputFacialTransformationMatrixes: false,
        }),
      ).catch((e: unknown) => {
        errors.push(`Face tracking unavailable: ${String(e)}`);
        return null;
      }),
    ]);
    return { segmenter, face, errors };
  })().catch((e: unknown) => {
    pending = null; // allow a retry later
    return { segmenter: null, face: null, errors: [`MediaPipe failed to load: ${String(e)}`] };
  });
  return pending;
}
