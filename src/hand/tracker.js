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
        this.gestureThreshold = 500; // ジェスチャーを確定するまでの時間 (500ms)

        this.hands = null;
        this.camera = null;
    }

    /**
     * MediaPipe Handsとカメラを初期化します。
     */
    async initialize() {
        // MediaPipe Handsの初期化
        this.hands = new Hands({
            locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        // オプションの設定
        this.hands.setOptions({
            maxNumHands: 1,
            modelComplexity: 1,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        // 結果を受け取るコールバックを設定
        this.hands.onResults((results) => this.onResults(results));

        // カメラの初期化
        this.camera = new Camera(this.video, {
            onFrame: async () => {
                await this.hands.send({ image: this.video });
            },
            width: 640,
            height: 480
        });

        await this.camera.start();

        // キャンバスのサイズ設定
        this.canvas.width = 640;
        this.canvas.height = 480;
    }

    /**
     * MediaPipeからの結果を処理し、描画とジェスチャー認識を行います。
     */
    onResults(results) {
        this.ctx.save();
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(results.image, 0, 0, this.canvas.width, this.canvas.height);

        if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            const landmarks = results.multiHandLandmarks[0];

            // ランドマークとコネクタを描画
            drawConnectors(this.ctx, landmarks, HAND_CONNECTIONS, { color: '#00FF00', lineWidth: 5 });
            drawLandmarks(this.ctx, landmarks, { color: '#FF0000', lineWidth: 2 });

            // ジェスチャーを認識
            const gesture = this.recognizeGesture(landmarks);
            // ジェスチャーが一定時間継続したかチェック
            this.handleGesture(gesture);

            // 画面のステータス表示を更新
            this.updateStatus('検出中', gesture);

        } else {
            // 手が検出されなかった場合
            this.updateStatus('未検出', null);
            this.handleGesture(null); // ジェスチャー状態をリセット
        }

        this.ctx.restore();
    }

    /**
     * ランドマークからグー・チョキ・パーを判定します。
     */
    recognizeGesture(landmarks) {
        // 各指の先端と第二関節のランドマークインデックス
        const fingerJoints = {
            thumb:  { tip: 4, pip: 2 },   // 親指
            index:  { tip: 8, pip: 6 },   // 人差し指
            middle: { tip: 12, pip: 10 }, // 中指
            ring:   { tip: 16, pip: 14 }, // 薬指
            pinky:  { tip: 20, pip: 18 }  // 小指
        };

        // 各指が伸びているかどうかのフラグ
        const isFingerExtended = {
            // 親指はX座標で判定（カメラ映像は左右反転しているため、先端が関節より左にあれば開いている）
            thumb:  landmarks[fingerJoints.thumb.tip].x < landmarks[fingerJoints.thumb.pip].x,
            // 他の4本の指はY座標で判定（先端が第二関節より上にあれば開いている）
            index:  landmarks[fingerJoints.index.tip].y  < landmarks[fingerJoints.index.pip].y,
            middle: landmarks[fingerJoints.middle.tip].y < landmarks[fingerJoints.middle.pip].y,
            ring:   landmarks[fingerJoints.ring.tip].y   < landmarks[fingerJoints.ring.pip].y,
            pinky:  landmarks[fingerJoints.pinky.tip].y  < landmarks[fingerJoints.pinky.pip].y,
        };

        // 判定ロジック
        const areAllFingersExtended = isFingerExtended.index && isFingerExtended.middle && isFingerExtended.ring && isFingerExtended.pinky;
        const areAllFingersFolded = !isFingerExtended.index && !isFingerExtended.middle && !isFingerExtended.ring && !isFingerExtended.pinky;

        if (areAllFingersExtended) {
            return 'paper'; // パー：4本の指が伸びている
        }
        if (isFingerExtended.index && isFingerExtended.middle && !isFingerExtended.ring && !isFingerExtended.pinky) {
            return 'scissors'; // チョキ：人差し指と中指だけが伸びている
        }
        if (areAllFingersFolded) {
            return 'rock'; // グー：4本の指が曲がっている
        }

        return null; // いずれでもない
    }

    /**
     * ジェスチャーが一定時間継続した場合にコールバックを呼び出します。
     * この関数（メソッド）はご提示いただいたロジックをそのまま使用しています。
     */
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
            // 閾値を超えたらジェスチャーを発火
            if (this.gestureCallback) {
                this.gestureCallback(gesture);
                // 連続発火を防ぐため、一度発火したらリセット
                this.lastGesture = null;
                this.gestureStartTime = 0;
            }
        }
    }

    /**
     * ジェスチャーが確定したときに呼ばれるコールバック関数を登録します。
     */
    onGesture(callback) {
        this.gestureCallback = callback;
    }
    
    /**
     * 画面上のステータス表示を更新します。
     */
    updateStatus(handStatus, gesture) {
        const handStatusEl = document.getElementById('hand-status');
        const gestureTypeEl = document.getElementById('gesture-type');
        
        const gestureText = {
            'rock': '✊ グー',
            'paper': '🖐️ パー',
            'scissors': '✌️ チョキ',
        }[gesture] || '-';
        
        if (handStatusEl) handStatusEl.textContent = handStatus;
        if (gestureTypeEl) gestureTypeEl.textContent = gestureText;
    }
}