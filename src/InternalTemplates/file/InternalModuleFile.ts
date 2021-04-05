import { InternalModule } from "../InternalModule";
import { get_date_string, UNSUPPORTED_MOBILE_TEMPLATE } from "../InternalUtils";

import { FileSystemAdapter, getAllTags, MarkdownView, normalizePath, TFile } from "obsidian";
import { ContextMode } from "TemplateParser";

export const TP_FILE_CURSOR = "<% tp.file.cursor %>";

export const DEPTH_LIMIT = 10;

export class InternalModuleFile extends InternalModule {
    name = "file";
    private static depth: number = 0;

    async generateTemplates() {
        this.templates.set("content", await this.generate_content());
        this.templates.set("creation_date", this.generate_creation_date());
        // Hack to prevent empty output
        this.templates.set("cursor", TP_FILE_CURSOR);
        this.templates.set("folder", this.generate_folder());
        this.templates.set("include", this.generate_include());
        this.templates.set("last_modified_date", this.generate_last_modified_date());
        this.templates.set("path", this.generate_path());
        this.templates.set("rename", this.generate_rename());
        this.templates.set("selection", this.generate_selection());
        this.templates.set("tags", this.generate_tags());
        this.templates.set("title", this.generate_title());
    }

    async generate_content() {
        return await this.app.vault.read(this.file);
    }

    generate_creation_date() {
        return (format: string = "YYYY-MM-DD HH:mm") => {
            return get_date_string(format, undefined, this.file.stat.ctime);
        }
    }

    generate_folder() {
        return (relative: boolean = false) => {
            let parent = this.file.parent;
            let folder;

            if (relative) {
                folder = parent.path;
            }
            else {
                folder = parent.name;
            }
            
            return folder;
        }
    }

    generate_include() {
        return async (include_filename: string) => {
            let inc_file = this.app.metadataCache.getFirstLinkpathDest(normalizePath(include_filename), "");
            if (!inc_file) {
                throw new Error(`File ${this.file} include doesn't exist`);
            }
            if (!(inc_file instanceof TFile)) {
                throw new Error(`${this.file} is a folder, not a file`);
            }

            // TODO: Add mutex for this, this may currently lead to a race condition. 
            // While not very impactful, that could still be annoying.
            InternalModuleFile.depth += 1;
            if (InternalModuleFile.depth > DEPTH_LIMIT) {
                throw new Error("Reached inclusion depth limit (max = 10)");
            }

            let inc_file_content = await this.app.vault.read(inc_file);
            let parsed_content = await this.plugin.parser.parseTemplates(inc_file_content, this.file, ContextMode.USER_INTERNAL);
            
            InternalModuleFile.depth -= 1;
        
            return parsed_content;
        }
    }

    generate_last_modified_date() {
        return (format: string = "YYYY-MM-DD HH:mm"): string => {
                return get_date_string(format, undefined, this.file.stat.mtime);
        }
    }

    generate_path() {
        return (relative: boolean = false) => {
            // TODO: fix that
            if (this.app.isMobile) {
                return UNSUPPORTED_MOBILE_TEMPLATE;
            }
            if (!(this.app.vault.adapter instanceof FileSystemAdapter)) {
                throw new Error("app.vault is not a FileSystemAdapter instance");
            }
            let vault_path = this.app.vault.adapter.getBasePath();

            if (relative) {
                return this.file.path;
            }
            else {
                return `${vault_path}/${this.file.path}`;
            }
        }
    }

    generate_rename() {
        return async (new_title: string) => {
            let new_path = normalizePath(`${this.file.parent.path}/${new_title}.${this.file.extension}`);
            await this.app.fileManager.renameFile(this.file, new_path);
            return "";
        }
    }

    generate_selection() {
        return () => {
            let active_view = this.app.workspace.getActiveViewOfType(MarkdownView);
            if (active_view == null) {
                throw new Error("Active view is null");
            }

            let editor = active_view.editor;
            return editor.getSelection();
        }
    }

    generate_tags() {
        let cache = this.app.metadataCache.getFileCache(this.file);
        return getAllTags(cache);
    }

    generate_title() {
        return this.file.basename;
    }
}