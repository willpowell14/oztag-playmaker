import { useEffect, useRef, useState } from "react";
import "./App.css";

const FIELD_WIDTH = 100;
const FIELD_LENGTH = 50;
const ROTATION_STEP = 5;
const DEFAULT_FRAME_DURATION_MS = 900;
const SAVED_PLAYS_KEY = "oztag-playmaker-saved-plays";

type Team = "attack" | "defence";
type Mode = "select" | "draw-run" | "draw-pass";
type LineType = "run" | "pass";

type Player = {
  id: string;
  role: string;
  team: Team;
  x: number;
  y: number;
  rotation: number;
};

type Ball = {
  x: number;
  y: number;
};

type Point = {
  x: number;
  y: number;
};

type TacticsLine = {
  id: string;
  type: LineType;
  playerId?: string;
  team?: Team;
  points: Point[];
};

type Frame = {
  id: string;
  name: string;
  note: string;
  players: Player[];
  ball: Ball;
  lines: TacticsLine[];
};

type SavedPlay = {
  id: string;
  name: string;
  frames: Frame[];
  savedAt: string;
};

const initialBall: Ball = { x: 31, y: 53 };

const initialPlayers: Player[] = [
  // Defence line
  { id: "defence-MW", role: "MW", team: "defence", x: 14, y: 10, rotation: 180 },
  { id: "defence-FL", role: "FL", team: "defence", x: 14, y: 22, rotation: 180 },
  { id: "defence-MR", role: "MR", team: "defence", x: 14, y: 34, rotation: 180 },
  { id: "defence-FM", role: "FM", team: "defence", x: 14, y: 47, rotation: 180 },
  { id: "defence-FR", role: "FR", team: "defence", x: 14, y: 65, rotation: 180 },
  { id: "defence-ML", role: "ML", team: "defence", x: 14, y: 78, rotation: 180 },
  { id: "defence-FW", role: "FW", team: "defence", x: 14, y: 90, rotation: 180 },

  // Defender who made the tag
  { id: "defence-MM", role: "MM", team: "defence", x: 23, y: 50, rotation: 180 },

  // Attack line
  { id: "attack-FW", role: "FW", team: "attack", x: 38, y: 10, rotation: 0 },
  { id: "attack-ML", role: "ML", team: "attack", x: 38, y: 22, rotation: 0 },
  { id: "attack-FR", role: "FR", team: "attack", x: 38, y: 34, rotation: 0 },

  // Ruck players
  { id: "attack-MM", role: "MM", team: "attack", x: 27, y: 50, rotation: 0 },
  { id: "attack-FM", role: "FM", team: "attack", x: 31, y: 50, rotation: 0 },

  { id: "attack-MR", role: "MR", team: "attack", x: 38, y: 65, rotation: 0 },
  { id: "attack-FL", role: "FL", team: "attack", x: 38, y: 78, rotation: 0 },
  { id: "attack-MW", role: "MW", team: "attack", x: 38, y: 90, rotation: 0 },
];

function clonePlayers(players: Player[]) {
  return players.map((player) => ({ ...player }));
}

function cloneBall(ball: Ball) {
  return { ...ball };
}

function cloneLines(lines: TacticsLine[]) {
  return lines.map((line) => ({
    ...line,
    points: line.points.map((point) => ({ ...point })),
  }));
}

function cloneFrames(frames: Frame[]) {
  return frames.map((frame) => ({
    ...frame,
    players: clonePlayers(frame.players),
    ball: cloneBall(frame.ball),
    lines: cloneLines(frame.lines),
  }));
}

function lerp(start: number, end: number, progress: number) {
  return start + (end - start) * progress;
}

function lerpRotation(start: number, end: number, progress: number) {
  const difference = ((end - start + 540) % 360) - 180;
  return (start + difference * progress + 360) % 360;
}

function interpolatePlayers(
  fromPlayers: Player[],
  toPlayers: Player[],
  progress: number
) {
  return fromPlayers.map((fromPlayer) => {
    const toPlayer = toPlayers.find((player) => player.id === fromPlayer.id);
    if (!toPlayer) return fromPlayer;

    return {
      ...fromPlayer,
      x: lerp(fromPlayer.x, toPlayer.x, progress),
      y: lerp(fromPlayer.y, toPlayer.y, progress),
      rotation: lerpRotation(fromPlayer.rotation, toPlayer.rotation, progress),
    };
  });
}

function App() {
  const pitchRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const initialFrame: Frame = {
    id: crypto.randomUUID(),
    name: "Frame 1",
    note: "Initial ruck setup.",
    players: clonePlayers(initialPlayers),
    ball: cloneBall(initialBall),
    lines: [],
  };

  const [players, setPlayers] = useState<Player[]>(initialPlayers);
  const [ball, setBall] = useState<Ball>(initialBall);
  const [lines, setLines] = useState<TacticsLine[]>([]);

  const [frames, setFrames] = useState<Frame[]>([initialFrame]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const [playName, setPlayName] = useState("Untitled Play");
  const [savedPlays, setSavedPlays] = useState<SavedPlay[]>([]);
  const [selectedSavedPlayId, setSelectedSavedPlayId] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isBallSelected, setIsBallSelected] = useState(false);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [isDraggingBall, setIsDraggingBall] = useState(false);
  const [lastPointer, setLastPointer] = useState<Point | null>(null);

  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<Point | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<Point | null>(null);

  const [mode, setMode] = useState<Mode>("select");
  const [activeLine, setActiveLine] = useState<TacticsLine | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SAVED_PLAYS_KEY);

    if (stored) {
      try {
        setSavedPlays(JSON.parse(stored));
      } catch {
        setSavedPlays([]);
      }
    }

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  useEffect(() => {
    if (isPlaying) return;

    setFrames((currentFrames) =>
      currentFrames.map((frame, index) =>
        index === currentFrameIndex
          ? {
              ...frame,
              players: clonePlayers(players),
              ball: cloneBall(ball),
              lines: cloneLines(lines),
            }
          : frame
      )
    );
  }, [players, ball, lines, currentFrameIndex, isPlaying]);

  function persistSavedPlays(nextSavedPlays: SavedPlay[]) {
    setSavedPlays(nextSavedPlays);
    localStorage.setItem(SAVED_PLAYS_KEY, JSON.stringify(nextSavedPlays));
  }

  function getPitchPosition(clientX: number, clientY: number) {
    if (!pitchRef.current) return null;

    const rect = pitchRef.current.getBoundingClientRect();

    return {
      x: ((clientY - rect.top) / rect.height) * FIELD_LENGTH,
      y: ((clientX - rect.left) / rect.width) * FIELD_WIDTH,
    };
  }

  function toSvgPoint(point: Point) {
    return {
      x: (point.y / FIELD_WIDTH) * 100,
      y: (point.x / FIELD_LENGTH) * 100,
    };
  }

  function pointsToPolyline(points: Point[]) {
    return points
      .map((point) => {
        const svgPoint = toSvgPoint(point);
        return `${svgPoint.x},${svgPoint.y}`;
      })
      .join(" ");
  }

  function getCurrentFramesSnapshot() {
    return frames.map((frame, index) =>
      index === currentFrameIndex
        ? {
            ...frame,
            players: clonePlayers(players),
            ball: cloneBall(ball),
            lines: cloneLines(lines),
          }
        : frame
    );
  }

  function savePlayToBrowser() {
    const cleanName = playName.trim() || "Untitled Play";
    const framesSnapshot = getCurrentFramesSnapshot();

    const existing = savedPlays.find((play) => play.name === cleanName);

    const savedPlay: SavedPlay = {
      id: existing?.id ?? crypto.randomUUID(),
      name: cleanName,
      frames: cloneFrames(framesSnapshot),
      savedAt: new Date().toISOString(),
    };

    const nextSavedPlays = existing
      ? savedPlays.map((play) => (play.id === existing.id ? savedPlay : play))
      : [...savedPlays, savedPlay];

    persistSavedPlays(nextSavedPlays);
    setSelectedSavedPlayId(savedPlay.id);
  }

  function loadSavedPlay(playId: string) {
    const play = savedPlays.find((item) => item.id === playId);
    if (!play || play.frames.length === 0) return;

    stopPlayback();

    const nextFrames = cloneFrames(play.frames);
    const firstFrame = nextFrames[0];

    setPlayName(play.name);
    setFrames(nextFrames);
    setCurrentFrameIndex(0);
    setPlayers(clonePlayers(firstFrame.players));
    setBall(cloneBall(firstFrame.ball));
    setLines(cloneLines(firstFrame.lines));
    setSelectedSavedPlayId(play.id);
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);
  }

  function deleteSavedPlay() {
    if (!selectedSavedPlayId) return;

    const nextSavedPlays = savedPlays.filter(
      (play) => play.id !== selectedSavedPlayId
    );
    persistSavedPlays(nextSavedPlays);
    setSelectedSavedPlayId("");
  }

  function exportCurrentPlay() {
    const cleanName = playName.trim() || "Untitled Play";

    const exportData: SavedPlay = {
      id: crypto.randomUUID(),
      name: cleanName,
      frames: cloneFrames(getCurrentFramesSnapshot()),
      savedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${cleanName.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function importPlayFromJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const importedPlay = JSON.parse(String(reader.result)) as SavedPlay;

        if (!importedPlay.name || !Array.isArray(importedPlay.frames)) {
          alert("That JSON file does not look like a valid Oztag play.");
          return;
        }

        const nextPlay: SavedPlay = {
          id: crypto.randomUUID(),
          name: importedPlay.name,
          frames: cloneFrames(importedPlay.frames),
          savedAt: new Date().toISOString(),
        };

        const nextSavedPlays = [...savedPlays, nextPlay];
        persistSavedPlays(nextSavedPlays);
        loadImportedPlay(nextPlay);
      } catch {
        alert("Could not import that JSON file.");
      } finally {
        if (importInputRef.current) {
          importInputRef.current.value = "";
        }
      }
    };

    reader.readAsText(file);
  }

  function loadImportedPlay(play: SavedPlay) {
    const nextFrames = cloneFrames(play.frames);
    const firstFrame = nextFrames[0];

    setPlayName(play.name);
    setFrames(nextFrames);
    setCurrentFrameIndex(0);
    setPlayers(clonePlayers(firstFrame.players));
    setBall(cloneBall(firstFrame.ball));
    setLines(cloneLines(firstFrame.lines));
    setSelectedSavedPlayId(play.id);
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);
  }

  function updateCurrentFrameNote(note: string) {
    setFrames((currentFrames) =>
      currentFrames.map((frame, index) =>
        index === currentFrameIndex ? { ...frame, note } : frame
      )
    );
  }

  function addFrame() {
    const newFrame: Frame = {
      id: crypto.randomUUID(),
      name: `Frame ${frames.length + 1}`,
      note: "",
      players: clonePlayers(players),
      ball: cloneBall(ball),
      lines: cloneLines(lines),
    };

    setFrames((currentFrames) => [...currentFrames, newFrame]);
    setCurrentFrameIndex(frames.length);
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);
  }

  function deleteCurrentFrame() {
    if (frames.length <= 1) return;

    const nextFrames = frames.filter((_, index) => index !== currentFrameIndex);
    const nextIndex = Math.max(0, currentFrameIndex - 1);
    const nextFrame = nextFrames[nextIndex];

    setFrames(nextFrames);
    setCurrentFrameIndex(nextIndex);
    setPlayers(clonePlayers(nextFrame.players));
    setBall(cloneBall(nextFrame.ball));
    setLines(cloneLines(nextFrame.lines));
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);
  }

  function loadFrame(index: number) {
    const frame = frames[index];
    if (!frame) return;

    stopPlayback();
    setPlayers(clonePlayers(frame.players));
    setBall(cloneBall(frame.ball));
    setLines(cloneLines(frame.lines));
    setCurrentFrameIndex(index);
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);
  }

  function goToPreviousFrame() {
    loadFrame(Math.max(0, currentFrameIndex - 1));
  }

  function goToNextFrame() {
    loadFrame(Math.min(frames.length - 1, currentFrameIndex + 1));
  }

  function playFromCurrentFrame() {
    if (frames.length < 2 || currentFrameIndex >= frames.length - 1) return;

    setIsPlaying(true);
    setSelectedIds([]);
    setIsBallSelected(false);
    setActiveLine(null);

    animateBetweenFrames(currentFrameIndex, currentFrameIndex + 1);
  }

  function stopPlayback() {
    setIsPlaying(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }

  function animateBetweenFrames(fromIndex: number, toIndex: number) {
    const fromFrame = frames[fromIndex];
    const toFrame = frames[toIndex];

    if (!fromFrame || !toFrame) {
      setIsPlaying(false);
      return;
    }

    const startTime = performance.now();

    function step(now: number) {
      const frameDuration = DEFAULT_FRAME_DURATION_MS / playbackSpeed;
      const progress = Math.min((now - startTime) / frameDuration, 1);

      setPlayers(interpolatePlayers(fromFrame.players, toFrame.players, progress));

      setBall({
        x: lerp(fromFrame.ball.x, toFrame.ball.x, progress),
        y: lerp(fromFrame.ball.y, toFrame.ball.y, progress),
      });

      if (progress >= 1) {
        setLines(cloneLines(toFrame.lines));
        setCurrentFrameIndex(toIndex);

        if (toIndex < frames.length - 1) {
          animateBetweenFrames(toIndex, toIndex + 1);
        } else {
          setIsPlaying(false);
        }

        return;
      }

      animationRef.current = requestAnimationFrame(step);
    }

    setLines(cloneLines(toFrame.lines));
    animationRef.current = requestAnimationFrame(step);
  }

  function rotateSelectedPlayers(direction: "left" | "right") {
    if (selectedIds.length === 0) return;

    const amount = direction === "left" ? -ROTATION_STEP : ROTATION_STEP;

    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => {
        if (!selectedIds.includes(player.id)) return player;

        return {
          ...player,
          rotation: Math.round((player.rotation + amount + 360) % 360),
        };
      })
    );
  }

  function handlePitchMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    if (isPlaying) return;

    const position = getPitchPosition(event.clientX, event.clientY);
    if (!position) return;

    if ((mode === "draw-run" || mode === "draw-pass") && activeLine) {
      setActiveLine({
        ...activeLine,
        points: [...activeLine.points, position],
      });
      return;
    }

    if (mode !== "select") return;

    setSelectedIds([]);
    setIsBallSelected(false);
    setIsSelecting(true);
    setSelectionStart(position);
    setSelectionEnd(position);
  }

  function handlePlayerMouseDown(
    event: React.MouseEvent<HTMLDivElement>,
    playerId: string
  ) {
    event.stopPropagation();
    if (isPlaying) return;

    const player = players.find((item) => item.id === playerId);
    if (!player) return;

    if (mode === "draw-run") {
      setSelectedIds([playerId]);
      setIsBallSelected(false);
      setActiveLine({
        id: crypto.randomUUID(),
        type: "run",
        playerId,
        team: player.team,
        points: [{ x: player.x, y: player.y }],
      });
      return;
    }

    if (mode === "draw-pass") {
      setSelectedIds([playerId]);
      setIsBallSelected(false);
      setActiveLine({
        id: crypto.randomUUID(),
        type: "pass",
        playerId,
        team: player.team,
        points: [{ x: player.x, y: player.y }],
      });
      return;
    }

    if (event.shiftKey) {
      setSelectedIds((current) =>
        current.includes(playerId)
          ? current.filter((id) => id !== playerId)
          : [...current, playerId]
      );
    } else if (!selectedIds.includes(playerId)) {
      setSelectedIds([playerId]);
      setIsBallSelected(false);
    }

    setDraggingId(playerId);
    setLastPointer({ x: event.clientX, y: event.clientY });
  }

  function handleBallMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (isPlaying) return;

    if (mode === "draw-pass") {
      setSelectedIds([]);
      setIsBallSelected(true);
      setActiveLine({
        id: crypto.randomUUID(),
        type: "pass",
        points: [{ x: ball.x, y: ball.y }],
      });
      return;
    }

    if (mode !== "select") return;

    if (event.shiftKey) {
      setIsBallSelected((current) => !current);
    } else if (!isBallSelected) {
      setSelectedIds([]);
      setIsBallSelected(true);
    }

    setIsDraggingBall(true);
    setLastPointer({ x: event.clientX, y: event.clientY });
  }

  function updatePlayerPositions(clientX: number, clientY: number) {
    if (mode !== "select" || isPlaying) return;
    if (!draggingId || !lastPointer) return;

    const oldPos = getPitchPosition(lastPointer.x, lastPointer.y);
    const newPos = getPitchPosition(clientX, clientY);

    if (!oldPos || !newPos) return;

    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;

    const idsToMove = selectedIds.includes(draggingId)
      ? selectedIds
      : [draggingId];

    setPlayers((currentPlayers) =>
      currentPlayers.map((player) => {
        if (!idsToMove.includes(player.id)) return player;

        return {
          ...player,
          x: Math.max(0, Math.min(FIELD_LENGTH, player.x + dx)),
          y: Math.max(0, Math.min(FIELD_WIDTH, player.y + dy)),
        };
      })
    );

    if (isBallSelected) {
      setBall((currentBall) => ({
        x: Math.max(0, Math.min(FIELD_LENGTH, currentBall.x + dx)),
        y: Math.max(0, Math.min(FIELD_WIDTH, currentBall.y + dy)),
      }));
    }

    setLastPointer({ x: clientX, y: clientY });
  }

  function updateBallPosition(clientX: number, clientY: number) {
    if (mode !== "select" || isPlaying) return;
    if (!isDraggingBall || !lastPointer) return;

    const oldPos = getPitchPosition(lastPointer.x, lastPointer.y);
    const newPos = getPitchPosition(clientX, clientY);

    if (!oldPos || !newPos) return;

    const dx = newPos.x - oldPos.x;
    const dy = newPos.y - oldPos.y;

    setBall((currentBall) => ({
      x: Math.max(0, Math.min(FIELD_LENGTH, currentBall.x + dx)),
      y: Math.max(0, Math.min(FIELD_WIDTH, currentBall.y + dy)),
    }));

    if (selectedIds.length > 0) {
      setPlayers((currentPlayers) =>
        currentPlayers.map((player) => {
          if (!selectedIds.includes(player.id)) return player;

          return {
            ...player,
            x: Math.max(0, Math.min(FIELD_LENGTH, player.x + dx)),
            y: Math.max(0, Math.min(FIELD_WIDTH, player.y + dy)),
          };
        })
      );
    }

    setLastPointer({ x: clientX, y: clientY });
  }

  function updateSelectionBox(clientX: number, clientY: number) {
    if (mode !== "select" || isPlaying) return;
    if (!isSelecting) return;

    const position = getPitchPosition(clientX, clientY);
    if (!position) return;

    setSelectionEnd(position);
  }

  function finishSelectionBox() {
    if (!isSelecting || !selectionStart || !selectionEnd) return;

    const minX = Math.min(selectionStart.x, selectionEnd.x);
    const maxX = Math.max(selectionStart.x, selectionEnd.x);
    const minY = Math.min(selectionStart.y, selectionEnd.y);
    const maxY = Math.max(selectionStart.y, selectionEnd.y);

    const selectedPlayers = players
      .filter(
        (player) =>
          player.x >= minX &&
          player.x <= maxX &&
          player.y >= minY &&
          player.y <= maxY
      )
      .map((player) => player.id);

    const ballInsideBox =
      ball.x >= minX && ball.x <= maxX && ball.y >= minY && ball.y <= maxY;

    setSelectedIds(selectedPlayers);
    setIsBallSelected(ballInsideBox);
    setIsSelecting(false);
    setSelectionStart(null);
    setSelectionEnd(null);
  }

  function finishActiveLine() {
    if (!activeLine || isPlaying) return;

    if (activeLine.points.length >= 2) {
      setLines((current) => [...current, activeLine]);
    }

    setActiveLine(null);
  }

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    updatePlayerPositions(event.clientX, event.clientY);
    updateBallPosition(event.clientX, event.clientY);
    updateSelectionBox(event.clientX, event.clientY);
  }

  function handleMouseUp() {
    setDraggingId(null);
    setIsDraggingBall(false);
    setLastPointer(null);
    finishSelectionBox();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") finishActiveLine();

    if (event.key === "Escape") {
      stopPlayback();
      setActiveLine(null);
      setIsSelecting(false);
      setSelectionStart(null);
      setSelectionEnd(null);
    }

    if (event.key === "q" || event.key === "Q") rotateSelectedPlayers("left");
    if (event.key === "e" || event.key === "E") rotateSelectedPlayers("right");
  }

  const selectionBox =
    selectionStart && selectionEnd
      ? {
          left: (Math.min(selectionStart.y, selectionEnd.y) / FIELD_WIDTH) * 100,
          top: (Math.min(selectionStart.x, selectionEnd.x) / FIELD_LENGTH) * 100,
          width: (Math.abs(selectionEnd.y - selectionStart.y) / FIELD_WIDTH) * 100,
          height: (Math.abs(selectionEnd.x - selectionStart.x) / FIELD_LENGTH) * 100,
        }
      : null;

  const allLines = activeLine ? [...lines, activeLine] : lines;
  const currentFrame = frames[currentFrameIndex];

  return (
    <div
      className="app"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <h1>Oztag Playmaker</h1>

      <div className="layout">
        <aside className="sidebar">
          <section className="control-section">
            <div className="section-header">
              <h2>Build Your Frame</h2>
              <p>Position players, set body shape, and draw running or passing lines.</p>
            </div>

            <div className="control-stack">
              <button
                className={mode === "select" ? "active" : ""}
                disabled={isPlaying}
                onClick={() => {
                  setMode("select");
                  setActiveLine(null);
                }}
              >
                Select / Move
              </button>

              <button
                className={mode === "draw-run" ? "active" : ""}
                disabled={isPlaying}
                onClick={() => {
                  setMode("draw-run");
                  setActiveLine(null);
                }}
              >
                Draw Run
              </button>

              <button
                className={mode === "draw-pass" ? "active" : ""}
                disabled={isPlaying}
                onClick={() => {
                  setMode("draw-pass");
                  setActiveLine(null);
                }}
              >
                Draw Pass
              </button>

              <div className="button-row">
                <button disabled={isPlaying} onClick={() => rotateSelectedPlayers("left")}>
                  Rotate Left
                </button>

                <button disabled={isPlaying} onClick={() => rotateSelectedPlayers("right")}>
                  Rotate Right
                </button>
              </div>

              <button
                disabled={isPlaying}
                onClick={() => {
                  setLines([]);
                  setActiveLine(null);
                }}
              >
                Clear Lines
              </button>
            </div>
          </section>

          <section className="control-section">
            <div className="section-header">
              <h2>Build Your Play</h2>
              <p>Create multiple frames to show how the move develops over time.</p>
            </div>

            <div className="control-stack">
              <div className="button-row">
                <button disabled={isPlaying} onClick={addFrame}>
                  + Add Frame
                </button>

                <button disabled={isPlaying || frames.length <= 1} onClick={deleteCurrentFrame}>
                  Delete Frame
                </button>
              </div>

              <div className="button-row">
                <button disabled={isPlaying || currentFrameIndex === 0} onClick={goToPreviousFrame}>
                  ◀ Previous
                </button>

                <button disabled={isPlaying || currentFrameIndex >= frames.length - 1} onClick={goToNextFrame}>
                  Next ▶
                </button>
              </div>

              <div className="button-row">
                <button disabled={isPlaying || currentFrameIndex >= frames.length - 1} onClick={playFromCurrentFrame}>
                  ▶ Play
                </button>

                <button disabled={!isPlaying} onClick={stopPlayback}>
                  ⏸ Stop
                </button>
              </div>

              <select
                value={playbackSpeed}
                disabled={isPlaying}
                onChange={(event) => setPlaybackSpeed(Number(event.target.value))}
              >
                <option value={0.25}>0.25x Speed</option>
                <option value={0.5}>0.5x Speed</option>
                <option value={1}>1x Speed</option>
                <option value={1.5}>1.5x Speed</option>
                <option value={2}>2x Speed</option>
              </select>

              <div className="frame-list">
                {frames.map((frame, index) => (
                  <button
                    key={frame.id}
                    disabled={isPlaying}
                    className={index === currentFrameIndex ? "active-frame" : ""}
                    onClick={() => loadFrame(index)}
                  >
                    {frame.name}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="control-section">
            <div className="section-header">
              <h2>Coach or Player Notes</h2>
              <p>Add simple instructions or talking points for the current frame.</p>
            </div>

            <div className="frame-note">
              <textarea
                value={currentFrame?.note ?? ""}
                disabled={isPlaying}
                onChange={(event) => updateCurrentFrameNote(event.target.value)}
                placeholder="Add notes for this phase..."
              />
            </div>
          </section>

          <section className="control-section">
            <div className="section-header">
              <h2>Save & Share</h2>
              <p>Save plays in this browser or export/import JSON files.</p>
            </div>

            <div className="control-stack">
              <input
                value={playName}
                disabled={isPlaying}
                onChange={(event) => setPlayName(event.target.value)}
                placeholder="Play name"
              />

              <button disabled={isPlaying} onClick={savePlayToBrowser}>
                Save Play
              </button>

              <select
                value={selectedSavedPlayId}
                disabled={isPlaying}
                onChange={(event) => loadSavedPlay(event.target.value)}
              >
                <option value="">Load saved play...</option>
                {savedPlays.map((play) => (
                  <option key={play.id} value={play.id}>
                    {play.name}
                  </option>
                ))}
              </select>

              <button disabled={isPlaying || !selectedSavedPlayId} onClick={deleteSavedPlay}>
                Delete Saved Play
              </button>

              <div className="button-row">
                <button disabled={isPlaying} onClick={exportCurrentPlay}>
                  Export JSON
                </button>

                <button disabled={isPlaying} onClick={() => importInputRef.current?.click()}>
                  Import JSON
                </button>
              </div>

              <input
                ref={importInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={importPlayFromJson}
              />
            </div>
          </section>
        </aside>

        <main className="main-board">
          <p className="hint">
            {mode === "select" &&
              "Select mode: drag players or the ball, Shift+click, box-select, or use Q/E to rotate selected players. Frames autosave as you edit."}
            {mode === "draw-run" &&
              "Draw Run mode: click a player, click pitch points, then press Enter to finish. Escape cancels."}
            {mode === "draw-pass" &&
              "Draw Pass mode: click a player or the ball, click the pass target, then press Enter to finish. Escape cancels."}
          </p>

          <div className="pitch" ref={pitchRef} onMouseDown={handlePitchMouseDown}>
            <div className="halfway-line" />

            {currentFrame?.note && (
              <div className="coach-note-overlay">{currentFrame.note}</div>
            )}

            <svg className="lines-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
              {allLines.map((line) => (
                <polyline
                  key={line.id}
                  points={pointsToPolyline(line.points)}
                  className={`tactics-line ${line.type} ${line.team ?? ""}`}
                />
              ))}
            </svg>

            {selectionBox && (
              <div
                className="selection-box"
                style={{
                  left: `${selectionBox.left}%`,
                  top: `${selectionBox.top}%`,
                  width: `${selectionBox.width}%`,
                  height: `${selectionBox.height}%`,
                }}
              />
            )}

            <div
              className={`ball ${isBallSelected ? "selected" : ""}`}
              style={{
                left: `${(ball.y / FIELD_WIDTH) * 100}%`,
                top: `${(ball.x / FIELD_LENGTH) * 100}%`,
              }}
              onMouseDown={handleBallMouseDown}
            >
              ●
            </div>

            {players.map((player) => (
              <div
                key={player.id}
                className={`player ${player.team} ${
                  selectedIds.includes(player.id) ? "selected" : ""
                }`}
                style={{
                  left: `${(player.y / FIELD_WIDTH) * 100}%`,
                  top: `${(player.x / FIELD_LENGTH) * 100}%`,
                  transform: `translate(-50%, -50%) rotate(${player.rotation}deg)`,
                }}
                onMouseDown={(event) => handlePlayerMouseDown(event, player.id)}
              >
                <span className="facing-marker" />
                <span
                  className="player-label"
                  style={{ transform: `rotate(${-player.rotation}deg)` }}
                >
                  {player.role}
                </span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;