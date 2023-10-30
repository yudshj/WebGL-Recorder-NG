import { Frame, Page, Worker } from 'playwright';

export const rejectOnTimeout = (delay: number) => new Promise((_, reject) => {
    setTimeout(reject, delay, new Error("rejectOnTimeout"));
});
export const evaluate_script_in_all_frames = (page: Page, str: string, timeout: number) => {
    console.info(`* evaluate_script_in_all_frames(${str});`);
    const promises = page.frames().map((frame: Frame) => Promise.race([frame.evaluate(str), rejectOnTimeout(timeout)]).catch(() => null));
    return Promise.allSettled(promises);
};
export const wait_for_function_in_all_frames = (page: Page, str: string, timeout: number) => {
    console.info(`* wait_for_function_in_all_frames(${str});`);
    const promises = page.frames().map((frame: Frame) => Promise.race([frame.waitForFunction(str), rejectOnTimeout(timeout)]).catch(() => null));
    return Promise.allSettled(promises);
};
export const get_data_in_all_workers = (page: Page, str: string, timeout: number, dataCallback: null | ((x: any)=>any) = null) => {
    console.info(`* GET_DATA_IN_ALL_WORKERS(${str});`);
    const promises = page.workers().map((worker: Worker) => {
        return Promise.race([worker.evaluate(str), rejectOnTimeout(timeout)])
            .then((data) => {
                return {
                    url: worker.url(),
                    data: dataCallback ? dataCallback(data) : data,
                    error: null,
                };
            })
            .catch((error) => {
                return {
                    url: worker.url(),
                    data: null,
                    error: error.message,
                };
            });
    });

    return Promise.allSettled(promises);
}
export const get_data_in_all_frames = (page: Page, str: string, timeout: number, dataCallback: null | ((x: any)=>any) = null) => {
    console.info(`* GET_DATA_IN_ALL_FRAMES(${str});`);
    const promises = page.frames().map((frame: Frame) => {
        return Promise.race([frame.evaluate(str), rejectOnTimeout(timeout)])
            .then((data) => {
                return {
                    name: frame.name(),
                    url: frame.url(),
                    data: dataCallback ? dataCallback(data) : data,
                    error: null,
                };
            })
            .catch((error: Error) => {
                return {
                    name: frame.name(),
                    url: frame.url(),
                    data: null,
                    error: error.message,
                };
            });
    });

    return Promise.allSettled(promises);
};
