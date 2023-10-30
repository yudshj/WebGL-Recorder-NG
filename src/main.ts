import { BrowserContextOptions, LaunchOptions, chromium } from 'playwright';
import * as fs from 'fs';
import { evaluate_script_in_all_frames, get_data_in_all_frames, wait_for_function_in_all_frames } from './utils';
// import * as zlib from "zlib";

interface LaunchOptionsDict {
    [key: string]: LaunchOptions;
  }

const useProxy = true;
const headless = false;
const NAME = 'cap';
const indexUrls: string[][] = [
    ["aquarium", "https://webglsamples.org/aquarium/aquarium.html"]
];

const launchOptions: LaunchOptionsDict = {};
function getLaunchOptions(name: string): LaunchOptions {
    let launchOption = launchOptions[name] || {
        headless: headless,
        args: [
            // "--enable-gpu",
            "--no-sandbox",
            '--disable-dev-shm-usage',
            '--memory-pressure-off',
            '--max-old-space-size=8192',
            '--js-flags="--max_old_space_size=8192"',
            '--ignore-certificate-errors',
            "--enable-gpu",
            "--use-gl=angle",
            "--use-vulkan"
        ],
    };
    if (useProxy) {
        launchOption.proxy = {
            server: proxyPool[Math.floor(Math.random() * proxyPool.length)],
            bypass: 'localhost,127.0.0.1'
        };
        console.log(name, " - PROXY: ", launchOption.proxy.server);
    }
    return launchOption;
}


const proxyPool = [
    // 'socks5://ss.maghsk.site:3539',
    // 'socks5://ss.maghsk.site:3535',
    'socks5://162.105.175.55:10701',
    'socks5://162.105.175.55:13838',
    'socks5://162.105.175.55:13839',
];
const contextOptions: BrowserContextOptions = { locale: 'en-US', ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'] };


(async () => {
    const total = indexUrls.length;
    for (let i = 0; i < total; i++) {
        const [idx, url] = indexUrls[i];
        const json_out_path = `output/${NAME}/${idx}.json`;
        const gzip_out_path = `output/${NAME}/${idx}.json.gz`;
        const error_out_path = `output/${NAME}/${idx}.error.txt`;

        if (fs.existsSync(json_out_path) || fs.existsSync(gzip_out_path) || fs.existsSync(error_out_path)) {
            console.info(`Skip ${idx} - ${url}`);
        } else {
            const browser = await chromium.launch(getLaunchOptions(NAME));
            console.info('  launch browser')
            const context = await browser.newContext(contextOptions);
            await context.addInitScript({ path: 'src/js/hydpako.min.js' });
            // await context.addInitScript({ path: 'src/js/inject-tiny.js' });
            await context.addInitScript({ path: 'src/js/webgl-capture.js' });

            const page = await context.newPage();
            await page.routeFromHAR('./output/har/aquarium.har.zip', {
                url: '**/*',
                update: false,
                notFound: 'fallback',
            });
            const date = Date.now();
            const start_time_hp = performance.now();

            console.info('  goto');
            let netIdleTimeout = -1;
            let domcontentTimeout = -1;
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
                .then(() => { domcontentTimeout = 0; evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('domcontentloaded - OK');", 10_000); })
                .catch(() => { domcontentTimeout = 1; evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('domcontentloaded - ERROR (TIMEOUT?)');", 10_000); })
                .catch(() => null);
            await page.waitForLoadState('networkidle', { timeout: 60_000 })
                .then(() => { netIdleTimeout = 0; evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('networkidle - OK');", 10_000); })
                .catch(() => { netIdleTimeout = 1; evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('networkidle - ERROR (TIMEOUT?)');", 10_000); })
                .catch(() => null);

            await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => null);

            console.info('  net idle');
            const net_idle_time_hp = performance.now();
            const net_idle_counters = await get_data_in_all_frames(page, "window.hydGetCounters();", 10_000);
            await evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('capture - START');", 10_000);
            await evaluate_script_in_all_frames(page, `HydWebGLCapture.startAll(); hydRemainFrames = 60;`, 10_000);
            await wait_for_function_in_all_frames(page, "HydWebGLCapture.allStopped()", 10_000);
            await evaluate_script_in_all_frames(page, "HydWebGLCapture.debugInfoAll('capture - STOP');", 10_000);
            console.info('  capture');
            const gl_cap_time_hp = performance.now();
            const gl_cap_counters = await get_data_in_all_frames(page, "window.hydGetCounters();", 10_000);
            // await wait_for_function_in_all_frames(page, "HydWebGLCapture.allStopped()", 10_000);

            // const gl_captures = await get_data_in_all_frames(page, "HydWebGLCapture.generateAll();", 30_000, (data: string[]) => data.map((d: string) => zlib.inflateSync(Buffer.from(d, 'base64')).toString()));
            const gl_captures = await get_data_in_all_frames(page, "HydWebGLCapture.generateAll();", 100_000);

            const data = {
                url,
                date,
                netIdleTimeout,
                events_time_hp: {
                    start_time_hp,
                    net_idle_time_hp,
                    gl_cap_time_hp,
                },
                frame: {
                    net_idle_counters,
                    gl_cap_counters,
                    gl_captures,
                }
            };
            console.log("  saving");
            // const compressedData = zlib.gzipSync(JSON.stringify(data));
            // fs.writeFileSync(gzip_out_path, compressedData);
            fs.writeFileSync(json_out_path, JSON.stringify(data));

            // await page.waitForEvent("close", {timeout: 3600_000});
            await context.close();
            console.log("  closed");
            await browser.close().catch(() => null);
        }
    }
})();

