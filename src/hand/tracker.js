import { Hands } from '@mediapipe/hands';
import { Camera } from '@mediapipe/camera_utils';
import { drawConnectors, drawLandmarks } from '@mediapipe/drawing_utils';
import { HAND_CONNECTIONS } from '@mediapipe/hands';

export class HandTracker {
    constructor(videoElement, canvasElement) {
        this.video = videoElement;
        this.canvas = canvasElement;
        this.ctx = canvasElement.getContext('2d');
        
        this.gestureCallback = null;
        this.lastGesture = null;
        this.gestureStartTime = 0;
        this.gestureThreshold = 300; // ms
        
        this.hands = null;
        this.camera = null;
    }

    async initialize() {
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.6
        });

        this.hands.onResults((results) => this.onResults(results));

        this.camera = new Camera(this.video, {
            onFrame: async () => {
                await this.hands.send({ image: this.video });
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        this.canvas.width = 640;
        this.canvas.height = 480;
    }

    onResults(results) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];
            drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 4 });
            drawLandmarks(this.ctx, landmarks, { color: '#FF0000', lineWidth: 2 });

            const gesture = this.recognizeGesture(landmarks);
            this.handleGesture(gesture);

            document.getElementById('hand-status').textContent = '検出中';
            document.getElementById('gesture-type').textContent = gesture || '-';
        } else {
            document.getElementById('hand-status').textContent = '未検出';
            document.getElementById('gesture-type').textContent = '-';
        }

        this.ctx.restore();
    }

    recognizeGesture(landmarks) {
        const wrist = landmarks[0];
        const middleBase = landmarks[9];

        const fingers = [
            { tip: 4, base: 2 },   // 親指
            { tip: 8, base: 5 },   // 人差し指
            { tip: 12, base: 9 },  // 中指
            { tip: 16, base: 13 }, // 薬指
            { tip: 20, base: 17 }  // 小指
        ];

        // 判定しきい値をゆるめに変更（0.05）
        const extended = fingers.map((finger, i) => {
            if (i === 0) {
                return Math.abs(landmarks[finger.tip].x - landmarks[finger.base].x) > 0.1;
            } else {
                return landmarks[finger.tip].y < landmarks[finger.base].y - 0.05;
            }
        });

        const extendedCount = extended.filter(x => x).length;

        // 👊 グー：指ほぼ曲がってる
        if (extendedCount <= 1) return 'right';

        // ✋ パー：全指 or 4本以上しっかり伸びてる（しきいゆるめ）
        if (extendedCount >= 4 && extended[1] && extended[2]) return 'left';

        // ✌ チョキ：人差し指＋中指だけ伸びてる
        if (extended[1] && extended[2] && !extended[0] && !extended[3] && !extended[4]) return 'rotate';

        // 👇 落下：手が明確に下を向いてるとき
        if (wrist.y > middleBase.y + 0.15) return 'down';

        return null;
    }

    handleGesture(gesture) {
        if (!gesture) {
            this.lastGesture = null;
            this.gestureStartTime = 0;
            return;
        }

        const now = Date.now();
        if (gesture !== this.lastGesture) {
            this.lastGesture = gesture;
            this.gestureStartTime = now;
        } else if (now - this.gestureStartTime > this.gestureThreshold) {
            if (this.gestureCallback) {
                this.gestureCallback(gesture);
            }
        }
    }

    onGesture(callback) {
        this.gestureCallback = callback;
    }
}
