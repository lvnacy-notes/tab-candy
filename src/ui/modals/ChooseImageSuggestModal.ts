import {
	App,
	FuzzySuggestModal,
	TFile
} from 'obsidian';
import { BACKGROUND_IMAGE_EXTENSIONS } from '../../utils/imageExtensions';

class ChooseImageSuggestModal extends FuzzySuggestModal<TFile> {
	onSubmit: (result: TFile) => void;

	constructor(app: App, onSubmit: (result: TFile) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Gets all supported image types from the vault. Uses the same extension
	 * list as the background-folder sync (src/utils/imageExtensions.ts) so a
	 * manually picked image and a folder-synced image are always held to the
	 * same rules.
	 */
	getItems(): TFile[] {
		return this.app.vault
			.getFiles()
			.filter((f) =>
				BACKGROUND_IMAGE_EXTENSIONS.includes(f.extension.toLowerCase())
			);
	}

	getItemText(item: TFile): string {
		return item.name;
	}

	onChooseItem(item: TFile, _evt: MouseEvent | KeyboardEvent): void {
		this.onSubmit(item);
		this.close();
	}
}

export default ChooseImageSuggestModal;