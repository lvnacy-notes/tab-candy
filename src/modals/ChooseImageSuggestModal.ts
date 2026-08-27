import {
	App,
	FuzzySuggestModal,
	TFile
} from 'obsidian';
import { BACKGROUND_IMAGE_EXTENSIONS } from '../Types/Images';

export interface Image {
	name: string;
	path: string;
}

class ChooseImageSuggestModal extends FuzzySuggestModal<TFile> {
	onSubmit: (result: TFile) => void;

	constructor(app: App, onSubmit: (result: TFile) => void) {
		super(app);
		this.onSubmit = onSubmit;
	}

	/**
	 * Gets all supported image types from the vault. Uses the same extension
	 * list as the background-folder sync (src/Types/Images.ts) so a manually
	 * picked image and a folder-synced image are never held to different
	 * rules - the pre-refactor version of this modal only allowed jpg/png,
	 * narrower than the folder sync's jpg/jpeg/png/webp/gif, for no reason
	 * other than the two lists having drifted apart.
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

	onChooseItem(item: TFile, evt: MouseEvent | KeyboardEvent): void {
		this.onSubmit(item);
		this.close();
	}
}

export default ChooseImageSuggestModal;