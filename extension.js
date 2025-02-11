// VS Code extension to create a Notepads panel
const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

function activate(context) {
    const notesFolder = path.join(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        '.vxnotes'
    );
    if (!fs.existsSync(notesFolder)) {
        fs.mkdirSync(notesFolder, { recursive: true });
    }

    const noteProvider = new NoteTreeProvider(notesFolder);
    vscode.window.registerTreeDataProvider('notepads', noteProvider);

    context.subscriptions.push(
        vscode.commands.registerCommand('notepads.addNote', () =>
            noteProvider.addNote()
        ),
        vscode.commands.registerCommand('notepads.openNote', (note) =>
            noteProvider.openNote(note)
        ),
        vscode.commands.registerCommand('notepads.deleteNote', (note) =>
            noteProvider.deleteNote(note)
        ),
        vscode.commands.registerCommand('notepads.renameNote', (note) =>
            noteProvider.renameNote(note)
        )
    );
}

class NoteTreeProvider {
    constructor(notesFolder) {
        this.notesFolder = notesFolder;
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }

    getTreeItem(element) {
        return element;
    }

    getChildren() {
        const files = fs.readdirSync(this.notesFolder)
            .filter(file => file.endsWith('.md'));
        
        // If no files exist, show the create note message
        if (files.length === 0) {
            const createNoteItem = new vscode.TreeItem(
                "Create New Note",
                vscode.TreeItemCollapsibleState.None
            );
            createNoteItem.command = {
                command: 'notepads.addNote',
                title: 'Create New Note'
            };
            createNoteItem.iconPath = new vscode.ThemeIcon('add');
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
            return treeItem;
        });
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

    deleteNote(note) {
        const notePath = path.join(this.notesFolder, note.label);
        fs.unlinkSync(notePath);
        this._onDidChangeTreeData.fire();
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
}

function deactivate() {}

module.exports = { activate, deactivate };
