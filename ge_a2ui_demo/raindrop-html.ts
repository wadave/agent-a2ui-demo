/**
 * HTML for raindrop demo.
 */
export const RAINDROP_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta content="connect-src 'none'" http-equiv="Content-Security-Policy">
    <title>WebGL Rain on Glass</title>
    <style>
        body { margin: 0; overflow: hidden; background-color: #000; }
        canvas { display: block; width: 100vw; height: 100vh; }
    </style>
</head>
<body>
    <canvas id="glcanvas"></canvas>

    <script id="vertex-shader" type="x-shader/x-vertex">
        attribute vec2 a_position;
        void main() {
            gl_Position = vec4(a_position, 0.0, 1.0);
        }
    </script>

<script id="fragment-shader" type="x-shader/x-fragment">
        precision mediump float;

        uniform float u_time;
        uniform vec2 u_resolution;

        // --- Helper Functions ---

        float N21(vec2 p) {
            p = fract(p * vec2(123.34, 345.45));
            p += dot(p, p + 34.345);
            return fract(p.x * p.y);
        }

        vec3 Background(vec2 uv) {
            vec3 color = vec3(0.0);

            vec3 lightPosSize[4];
            vec3 lightColor[4];

            lightPosSize[0] = vec3(0.2, 0.5, 0.1); lightColor[0] = vec3(1.0, 0.1, 0.1);
            lightPosSize[1] = vec3(0.8, 0.6, 0.15); lightColor[1] = vec3(0.1, 0.5, 1.0);
            lightPosSize[2] = vec3(0.5, 0.2, 0.2); lightColor[2] = vec3(1.0, 0.8, 0.2);
            lightPosSize[3] = vec3(0.1, 0.1, 0.1); lightColor[3] = vec3(1.0, 1.0, 1.0);

            for (int i = 0; i < 4; i++) {
                vec3 lps = lightPosSize[i];
                vec3 col = lightColor[i];

                vec2 pos = lps.xy;
                float size = lps.z;

                float d = length(uv - pos);
                float mask = smoothstep(size + 0.2, size - 0.1, d);
                // Background is slightly dimmer in heavy rain due to the water sheet
                color += col * mask * 0.6;
            }

            color += vec3(0.1, 0.1, 0.2) * (uv.y + 0.5);
            return color;
        }

        vec3 RainLayer(vec2 uv, float t) {
            vec2 aspect = vec2(2.0, 1.0);
            // INCREASED: Base grid density from 4.0 to 6.0
            vec2 st = uv * aspect * 6.0;

            vec2 id = floor(st);
            st.y += t * 0.22;

            float n = N21(id);
            st.y += n;

            vec2 id2 = floor(st);
            vec2 gridUv = fract(st) - 0.5;

            t += n * 6.283;

            float w = uv.y * 10.0;
            float x = (n - 0.5) * 0.8;
            x += (0.4 - abs(x)) * sin(3.0 * w) * pow(sin(w), 6.0) * 0.45;

            float y = -sin(t + sin(t + sin(t) * 0.5)) * 0.45;
            y -= (gridUv.x - x) * (gridUv.x - x);

            vec2 dropPos = (gridUv - vec2(x, y)) / aspect;
            float drop = smoothstep(0.05, 0.03, length(dropPos));

            vec2 trailPos = (gridUv - vec2(x, t * 0.25)) / aspect;
            trailPos.y = (fract(trailPos.y * 8.0) - 0.5) / 8.0;
            float trail = smoothstep(0.03, 0.01, length(trailPos));

            float fogTrail = smoothstep(-0.05, 0.05, dropPos.y);
            fogTrail *= smoothstep(0.5, y, gridUv.y);
            trail *= fogTrail;

            float mask = drop + trail;

            vec2 normal = vec2(0.0);
            if (mask > 0.0) {
                 normal = dropPos * drop + trailPos * trail;
            }

            return vec3(normal, mask);
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / u_resolution.xy;
            vec2 rainUV = uv;
            rainUV.x *= u_resolution.x / u_resolution.y;

            // INCREASED: Global time speed for heavier, faster rain
            float t = u_time * 0.8;

            // --- MULTIPLE LAYERS OF RAIN ---
            // Layer 1: Large drops (foreground)
            vec3 rain1 = RainLayer(rainUV, t);

            // Layer 2: Medium drops, shifted slightly, moving slightly faster
            vec3 rain2 = RainLayer(rainUV * 1.6 + vec2(0.5, 0.2), t * 1.2);

            // Layer 3: Small, fast drops in the background
            vec3 rain3 = RainLayer(rainUV * 2.3 - vec2(0.3, 0.8), t * 1.5);

            // Combine the normals (distortions) from all layers
            vec2 totalDistortion = rain1.xy + (rain2.xy * 0.6) + (rain3.xy * 0.3);

            // Combine the masks to know if we are inside ANY drop
            float totalMask = clamp(rain1.z + rain2.z + rain3.z, 0.0, 1.0);

            // Apply a stronger distortion for the heavy rain
            vec2 distortedUV = uv - totalDistortion * 2.5;

            vec3 bg = Background(distortedUV);

            // Apply specular highlight if we are inside any drop
            if (totalMask > 0.0) {
                float light = dot(normalize(vec3(totalDistortion, 1.0)), normalize(vec3(0.5, 1.0, 0.5)));
                bg += pow(max(0.0, light), 8.0) * 0.9;
            }

            gl_FragColor = vec4(bg, 1.0);
        }
    </script>

    <script>
        const canvas = document.getElementById("glcanvas");
        const gl = canvas.getContext("webgl");

        if (!gl) { alert("WebGL not supported"); }

        function createShader(gl, type, source) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error(gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vsSource = document.getElementById("vertex-shader").text;
        const fsSource = document.getElementById("fragment-shader").text;

        const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
        const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);

        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);

        const positions = new Float32Array([ -1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1 ]);
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

        const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
        const timeUniformLocation = gl.getUniformLocation(program, "u_time");
        const resolutionUniformLocation = gl.getUniformLocation(program, "u_resolution");

        function render(time) {
            time *= 0.001;
            if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                canvas.width = canvas.clientWidth;
                canvas.height = canvas.clientHeight;
                gl.viewport(0, 0, canvas.width, canvas.height);
            }

            gl.useProgram(program);
            gl.enableVertexAttribArray(positionAttributeLocation);
            gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
            gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);

            gl.uniform1f(timeUniformLocation, time);
            gl.uniform2f(resolutionUniformLocation, canvas.width, canvas.height);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            requestAnimationFrame(render);
        }
        requestAnimationFrame(render);
    </script>
</body>
</html>
`;
