declare module 'lemonlog' {
    interface Logger {
        debug(...args: unknown[]): void;
        info(...args: unknown[]): void;
        warn(...args: unknown[]): void;
        error(...args: unknown[]): void;
    }
    function lemonlog(name: string): Logger;
    export = lemonlog;
}
