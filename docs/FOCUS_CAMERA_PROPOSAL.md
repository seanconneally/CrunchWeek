# Optional focus insights: proposal, not an implemented feature

On-device object detection can estimate when a phone is visible in a camera frame. It cannot establish whether someone is using the phone, distracted, learning effectively or cheating. A phone may be used for notes, accessibility, authentication or coursework. This feature should first be tested as an optional student-owned experiment.

Suggested flow: before a focus session, a separate camera toggle explains processing and asks for browser permission. Show a visible camera indicator and a way to stop it immediately. Turning off the camera must never prevent ordinary study or progress logging.

Process low-rate frames locally in the browser with an object detector, without recording or sending video, images or audio to a server. Release camera tracks on pause, session end, navigation away and unmount. Model assets may need a one-time download; distinguish that download from uploading camera frames. Camera-denied or unavailable states should leave the ordinary timer usable.

Report possible phone visibility, the analysed portion of the session and time when the camera/detector was unavailable. Require several consecutive detections, show uncertainty and let the student dismiss an incorrect result. Avoid attention scores, accusations and grade predictions. Never infer phone-use minutes from a simple count of frames without measuring actual elapsed time and detector coverage.

Keep aggregate summaries ephemeral by default. Saving a summary should be a separate student choice with deletion available. Do not provide video or individual camera summaries to institutions, friends or employers. No face recognition or identity tracking is needed.

Costs: local processing avoids per-frame cloud inference charges but consumes device compute, power and development/maintenance time. Accuracy must be measured with varied camera positions, lighting, phones and relevant study uses. Measure battery impact and opt-in/retention with real students before making this central to the product.

The scheduling/chat workflow remains the first priority: it solves a clear planning task with a smaller trust burden. Camera monitoring has not been enabled or implemented in this change.

Technical starting point: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js
Local model: https://ollama.com/library/qwen2.5:1.5b
Structured local output: https://docs.ollama.com/capabilities/structured-outputs
