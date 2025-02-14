// VS Code extension to create a Notepads panel
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    // Get global notes location from settings
    const config = vscode.workspace.getConfiguration('notepads');
    let globalNotesPath = config.get('globalNotesPath');

    const notesFolder = path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        '.vxnotes'
    );
    if (!fs.existsSync(notesFolder)) {
        fs.mkdirSync(notesFolder, { recursive: true });
    }

    // Add .vxnotes to files.exclude setting
    const configWorkspace = vscode.workspace.getConfiguration('files');
    const exclude = configWorkspace.get('exclude');
    if (!exclude['.vxnotes']) {
        exclude['.vxnotes'] = true;
        configWorkspace.update('exclude', exclude, vscode.ConfigurationTarget.Workspace);
    }

    // Create providers for both local and global notes
    const localNoteProvider = new NoteTreeProvider(notesFolder, false);
    const globalNoteProvider = new NoteTreeProvider(globalNotesPath, true);
    
    vscode.window.registerTreeDataProvider('localNotepads', localNoteProvider);
    vscode.window.registerTreeDataProvider('globalNotepads', globalNoteProvider);

    // Register commands for both providers
    context.subscriptions.push(
        vscode.commands.registerCommand('notepads.selectGlobalLocation', async () => {
            const result = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                title: 'Select Global Notes Location'
            });

            if (result && result[0]) {
                const folderPath = result[0].fsPath;
                await config.update('globalNotesPath', folderPath, vscode.ConfigurationTarget.Global);
                globalNoteProvider.updateNotesFolder(folderPath);
            }
        }),
        vscode.commands.registerCommand('notepads.addLocalNote', () =>
            localNoteProvider.addNote()
        ),
        vscode.commands.registerCommand('notepads.addGlobalNote', () =>
            globalNoteProvider.addNote()
        ),
        vscode.commands.registerCommand('notepads.openNote', (note) =>
            note.provider.openNote(note)
        ),
        vscode.commands.registerCommand('notepads.deleteNote', (note) =>
            note.provider.deleteNote(note)
        ),
        vscode.commands.registerCommand('notepads.renameNote', (note) =>
            note.provider.renameNote(note)
        )
    );

    // Start the folder check for global notes
    globalNoteProvider.startFolderCheck();
}

class NoteTreeProvider {
    constructor(notesFolder, isGlobal) {
        this.notesFolder = notesFolder;
        this.isGlobal = isGlobal;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    updateNotesFolder(newPath) {
        this.notesFolder = newPath;
        if (!fs.existsSync(newPath)) {
            fs.mkdirSync(newPath, { recursive: true });
        }
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element) {
        return element;
    }

    getChildren() {
        // For global notes, check if folder exists
        if (this.isGlobal && (!this.notesFolder || !fs.existsSync(this.notesFolder))) {
            const selectLocationItem = new vscode.TreeItem(
                "Select Location",
                vscode.TreeItemCollapsibleState.None
            );
            selectLocationItem.command = {
                command: 'notepads.selectGlobalLocation',
                title: 'VX Notepads: Select Global Notes Location'
            };
            selectLocationItem.iconPath = new vscode.ThemeIcon('folder');
            selectLocationItem.tooltip = 'Configure where to store your global notes';
            selectLocationItem.contextValue = 'selectLocation';
            return [selectLocationItem];
        }

        try {
            const files = fs.readdirSync(this.notesFolder)
                .filter(file => file.endsWith('.md'));
            
            // If no files exist, show the create note message
            if (files.length === 0) {
                const createNoteItem = new vscode.TreeItem(
                    "Create New Note",
                    vscode.TreeItemCollapsibleState.None
                );
                createNoteItem.command = {
                    command: this.isGlobal ? 'notepads.addGlobalNote' : 'notepads.addLocalNote',
                    title: this.isGlobal ? 'VX Notepads: New Global Note' : 'VX Notepads: New Note'
                };
                createNoteItem.iconPath = new vscode.ThemeIcon('add');
                createNoteItem.contextValue = this.isGlobal ? 'emptyGlobal' : 'createNote';
                return [createNoteItem];
            }

            // Return existing files if any
            return files.map((file) => {
                const treeItem = new vscode.TreeItem(
                    file,
                    vscode.TreeItemCollapsibleState.None
                );
                treeItem.command = {
                    command: 'notepads.openNote',
                    title: 'Open Note',
                    arguments: [treeItem]
                };
                treeItem.contextValue = 'note';
                treeItem.provider = this;
                return treeItem;
            });
        } catch (error) {
            // If there's an error reading the directory (e.g., it was deleted)
            if (this.isGlobal) {
                // Reset global notes path in settings
                vscode.workspace.getConfiguration('notepads').update('globalNotesPath', '', vscode.ConfigurationTarget.Global);
                this.notesFolder = null;
                // Refresh the view to show select location option
                this._onDidChangeTreeData.fire();
            }
            return [];
        }
    }

    addNote() {
        const noteName = 'Unnamed';
        let counter = 1;
        let finalName = noteName;
        
        // Check if file already exists and increment counter
        while (fs.existsSync(path.join(this.notesFolder, finalName + '.md'))) {
            finalName = `${noteName}_${counter}`;
            counter++;
        }

        const notePath = path.join(this.notesFolder, finalName + '.md');
        fs.writeFileSync(notePath, '');
        this._onDidChangeTreeData.fire();
    }

    openNote(note) {
        const notePath = path.join(this.notesFolder, note.label);
        vscode.workspace.openTextDocument(notePath).then((doc) => {
            vscode.window.showTextDocument(doc);
        });
    }

    async deleteNote(note) {
        const response = await vscode.window.showWarningMessage(
            `Are you sure you want to delete "${note.label}"?`,
            { modal: true },
            'Delete'
        );

        if (response === 'Delete') {
            const notePath = path.join(this.notesFolder, note.label);
            fs.unlinkSync(notePath);
            this._onDidChangeTreeData.fire();
        }
    }

    renameNote(note) {
        vscode.window
            .showInputBox({
                prompt: 'Enter new name for the note',
                value: path.parse(note.label).name
            })
            .then((newName) => {
                if (newName) {
                    const oldPath = path.join(this.notesFolder, note.label);
                    const newPath = path.join(this.notesFolder, newName + '.md');
                    fs.renameSync(oldPath, newPath);
                    this._onDidChangeTreeData.fire();
                }
            });
    }

    // Add a method to check if the folder exists periodically
    startFolderCheck() {
        if (this.isGlobal) {
            setInterval(() => {
                if (this.notesFolder && !fs.existsSync(this.notesFolder)) {
                    this._onDidChangeTreeData.fire();
                }
            }, 5000); // Check every 5 seconds
        }
    }
}

function deactivate() {}

module.exports = { activate, deactivate };
