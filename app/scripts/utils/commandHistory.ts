import { browser } from 'webextension-polyfill-ts';

export class CommandHistory {
    private nthToLastPosition = 0;
    private commandHistory = [];

    private async loadCommandHistory() {
        await browser.storage.local.get({ commandHistory: [] }).then(results => {
            let commandHistory = results.commandHistory;
            if (!(commandHistory instanceof Array)) {
                console.warn('command History empty or corrupted');
            }
            this.commandHistory = commandHistory;
            return true;
        });
    }

    async previousCommand(): Promise<string> {
        await this.loadCommandHistory();
        this.nthToLastPosition = Math.min(this.commandHistory.length, this.nthToLastPosition + 1);
        return this.commandHistory[this.commandHistory.length - this.nthToLastPosition];
    }

    nextCommand(): string {
        this.loadCommandHistory();
        this.nthToLastPosition = Math.max(0, this.nthToLastPosition - 1);
        return this.nthToLastPosition === 0 ? '' : this.commandHistory[this.commandHistory.length - this.nthToLastPosition];
    }

    async lastNCommands(n: number): Promise<string[]> {
        await this.loadCommandHistory();
        return this.commandHistory.slice(-n);
    }

    resetHistoryPosition() {
        this.nthToLastPosition = 0;
    }

    addCommandToHistory(command: string) {
        if (command.length === 0) return; // ignore empty commands

        // this happens asynchronously, but I don't care if commands end up in the wrong order when you add two of them within miliseconds of each other
        browser.storage.local.get({ commandHistory: [] }).then(results => {
            if (!(results.commandHistory instanceof Array)) {
                results.commandHistory = new Array();
            }
            results.commandHistory.push(command);
            browser.storage.local.set(results);
        });
    }
}
