import { useRef, useState } from "react";
import { addPickedSongsToBrowser } from "../song/browserLibrary";
import type { PickedFile } from "../song/songFolder";
import { describeAddedSongs } from "./addSongText";
import { buttonClass, quietButtonClass } from "./lab/styles";

type AddSongProps = {
  /** The screen's main action when there are no songs yet; a quiet link once there are. */
  prominent: boolean;
  /** Called after every attempt, since a folder of several songs can be partly added before one fails. */
  onLibraryChanged: () => void;
};

type AddSongReport = { text: string; failed: boolean };

/** Lets the learner pick an imported song's folder, and keeps that song in this browser. */
export function AddSong({ prominent, onLibraryChanged }: AddSongProps) {
  const folderPicker = useRef<HTMLInputElement | null>(null);
  const [adding, setAdding] = useState(false);
  const [report, setReport] = useState<AddSongReport | null>(null);

  async function addFolder(pickedFiles: PickedFile[]) {
    setAdding(true);
    setReport(null);
    try {
      const outcome = await addPickedSongsToBrowser(pickedFiles);
      setReport({ text: describeAddedSongs(outcome), failed: false });
    } catch (cause) {
      setReport({ text: cause instanceof Error ? cause.message : String(cause), failed: true });
    } finally {
      setAdding(false);
      onLibraryChanged();
    }
  }

  function onFolderPicked(picker: HTMLInputElement) {
    // Copied out before the picker is cleared, which empties its own list.
    const pickedFiles = [...(picker.files ?? [])].map((file) => ({
      relativePath: file.webkitRelativePath,
      contents: file,
    }));
    // Cleared so that picking the same folder again is noticed.
    picker.value = "";
    if (pickedFiles.length > 0) void addFolder(pickedFiles);
  }

  return (
    <div>
      <button
        // A fresh button for each look, so the first song arriving does not show one style fading into the other.
        key={prominent ? "prominent" : "quiet"}
        onClick={() => folderPicker.current?.click()}
        disabled={adding}
        className={prominent ? buttonClass : quietButtonClass}
      >
        {adding ? "Adding" : "Add a song"}
      </button>
      <input
        ref={(element) => {
          folderPicker.current = element;
          // Makes the picker choose a folder. React has no property for it.
          element?.setAttribute("webkitdirectory", "");
        }}
        type="file"
        multiple
        hidden
        data-testid="song-folder"
        onChange={(event) => onFolderPicked(event.target)}
      />
      {report && (
        <p role="status" className={`mt-3 max-w-prose text-sm ${report.failed ? "text-signal" : "text-mist"}`}>
          {report.text}
        </p>
      )}
    </div>
  );
}
