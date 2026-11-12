
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext.js";
import api from "../services/api.js";
import { socket } from "../socket/socket.js";

interface Meeting {
  _id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled";
  createdBy?: {
  _id: string;
};
}

interface Participant {
  socketId: string;
  userId: string;
  userName: string;
  cameraOn?: boolean;
  isScreenSharing?: boolean;
  micOn?: boolean;
}

interface RemoteParticipant {
  socketId: string;
  userName: string;
  stream: MediaStream;
  cameraOn: boolean;
  isScreenSharing: boolean;
  micOn: boolean;
}

interface SignalMessage {
  signal: RTCSessionDescriptionInit;
  senderSocketId: string;
  roomId: string;
}

interface IceCandidateMessage {
  candidate: RTCIceCandidateInit;
  senderSocketId: string;
  roomId: string;
}

interface MediaStatusMessage {
  roomId: string;
  socketId: string;
  userId: string;
  userName: string;
  cameraOn: boolean;
  isScreenSharing: boolean;
}

interface MicStatusMessage {
  roomId: string;
  socketId: string;
  userId: string;
  userName: string;
  micOn: boolean;
}

interface ChatMessage {
  id: string;
  senderSocketId: string;
  senderUserId: string;
  senderName: string;
  message: string;
  createdAt: string;
}

interface TypingParticipant {
  socketId: string;
  userName: string;
}

interface MeetingSummaryData {
  _id?: string;
  summary: string;
  keyPoints: string[];
  decisions: string[];
  actionItems: {
    task: string;
    assignee: string | null;
    dueDate: string | null;
    priority: "high" | "medium" | "low";
  }[];
  modelName?: string;
  createdAt?: string;
}

const MeetingRoom = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map());
  const remotePlaybackContextRef = useRef<AudioContext | null>(null);
  const remoteAudioSourcesRef = useRef<Map<string, MediaStreamAudioSourceNode>>(new Map());
  const remoteAudioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  

  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(
    new Map()
  );
  // Prevent duplicate offers and wait until local media tracks are attached.
  const offerInProgressRef = useRef<Set<string>>(new Set());
  const peerSetupPromisesRef = useRef<Map<string, Promise<void>>>(new Map());

  const participantsRef = useRef<Map<string, Participant>>(new Map());
  // Keep the newest media status even if it arrives before room-users/user-joined.
  const mediaStatusRef = useRef<Map<string, Pick<Participant, "cameraOn" | "isScreenSharing" | "micOn">>>(new Map());
  const pendingIceCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mediaError, setMediaError] = useState("");

  const [micOn, setMicOn] = useState(false);
  const micOnRef = useRef(micOn);
  micOnRef.current = micOn;
  const [meetingAudioEnabled, setMeetingAudioEnabled] = useState(true);
  const meetingAudioEnabledRef = useRef(true);
  meetingAudioEnabledRef.current = meetingAudioEnabled;
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioMeterStatus, setAudioMeterStatus] = useState("Starting microphone...");
  const audioMeterContextRef = useRef<AudioContext | null>(null);
  const audioMeterFrameRef = useRef<number | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaInitialized, setMediaInitialized] = useState(false);

  const joinedSocketIdRef = useRef<string | null>(null);

  const [activeSidebarTab, setActiveSidebarTab] = useState<"participants" | "chat" | "transcript" | "summary">("participants");

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [remoteParticipants, setRemoteParticipants] = useState<
    RemoteParticipant[]
  >([]);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [typingUsers, setTypingUsers] = useState<TypingParticipant[]>([]);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const cameraOnRef = useRef(cameraOn);
  const isScreenSharingRef = useRef(isScreenSharing);

  // Full-stage recording: compose all visible participant videos on a canvas
  // and mix local + remote audio tracks into one MediaRecorder stream.
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordingError, setRecordingError] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const recordingAnimationRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const recordingAudioContextRef = useRef<AudioContext | null>(null);
  const recordingAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const audioOnlyRecorderRef = useRef<MediaRecorder | null>(null);
  const audioOnlyChunksRef = useRef<Blob[]>([]);
  const [transcriptText, setTranscriptText] = useState("");
  const [transcriptionStatus, setTranscriptionStatus] = useState<"idle" | "uploading" | "completed" | "failed">("idle");
  const [transcriptionError, setTranscriptionError] = useState("");
  const [meetingSummary, setMeetingSummary] = useState<MeetingSummaryData | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryGenerating, setSummaryGenerating] = useState(false);
  const [summaryError, setSummaryError] = useState("");

  

  // Keep refs current for browser track callbacks that may outlive a render.
  cameraOnRef.current = cameraOn;
  isScreenSharingRef.current = isScreenSharing;

  // Automatically scroll to the latest chat message
  useEffect(() => {
    chatMessagesRef.current?.scrollTo({
      top: chatMessagesRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, typingUsers]);


  useEffect(() => {
  console.log(
    "REMOTE PARTICIPANTS STATE:",
    remoteParticipants.map((participant) => ({
      name: participant.userName,
      cameraOn: participant.cameraOn,
      isScreenSharing: participant.isScreenSharing,
      streamId: participant.stream.id,
      videoTracks: participant.stream.getVideoTracks().map((track) => ({
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
      })),
    }))
  );
}, [remoteParticipants]);

  // Fetch meeting details
  useEffect(() => {
    let active = true;

    const fetchMeeting = async () => {
      try {
        const response = await api.get(`/meetings/${id}`);

        if (active) {
          setMeeting(response.data.meeting ?? response.data);
        }
      } catch (err: any) {
        if (active) {
          setError(
            err.response?.data?.message || "Failed to load meeting room."
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    if (id) {
      fetchMeeting();
    }

    return () => {
      active = false;
    };
  }, [id]);

  // Start camera and microphone
  useEffect(() => {
    let active = true;

    const startMedia = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMediaError(
          "Camera and microphone access is not supported in this browser."
        );
        setMediaLoading(false);
        setMediaInitialized(true);
        return;
      }

      try {
        // Acquire the initial devices so the browser can reveal microphone labels.
        // Some systems report a virtual device (for example, Steam Streaming
        // Microphone) as the default even when the physical microphone works.
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: true,
        });

        // Prefer the verified physical input when it is present. The user's
        // microphone test showed that "Microphone Array" captures voice while
        // the selected Steam virtual input returns silence.
        try {
          const audioInputs = (await navigator.mediaDevices.enumerateDevices())
            .filter((device) => device.kind === "audioinput");
          const preferredMicrophone = audioInputs.find((device) =>
            device.label.toLowerCase().includes("microphone array")
          );
          const currentAudioTrack = stream.getAudioTracks()[0];

          if (
            preferredMicrophone &&
            currentAudioTrack &&
            currentAudioTrack.getSettings().deviceId !== preferredMicrophone.deviceId
          ) {
            console.info("SELECTING VERIFIED PHYSICAL MICROPHONE:", {
              selected: preferredMicrophone.label,
              previous: currentAudioTrack.label,
            });

            const physicalMicStream = await navigator.mediaDevices.getUserMedia({
              audio: {
                deviceId: { exact: preferredMicrophone.deviceId },
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
              },
              video: false,
            });
            const physicalMicTrack = physicalMicStream.getAudioTracks()[0];

            if (!physicalMicTrack) {
              physicalMicStream.getTracks().forEach((track) => track.stop());
              throw new Error("The selected Microphone Array did not provide an audio track.");
            }

            stream.removeTrack(currentAudioTrack);
            currentAudioTrack.stop();
            stream.addTrack(physicalMicTrack);

            console.info("PHYSICAL MICROPHONE READY:", {
              label: physicalMicTrack.label,
              deviceId: physicalMicTrack.getSettings().deviceId,
              enabled: physicalMicTrack.enabled,
              readyState: physicalMicTrack.readyState,
            });
          } else {
            console.info("USING BROWSER MICROPHONE:", {
              label: currentAudioTrack?.label ?? "No audio track",
              deviceId: currentAudioTrack?.getSettings().deviceId ?? null,
            });
          }
        } catch (microphoneSelectionError) {
          console.error(
            "FAILED TO SELECT THE VERIFIED PHYSICAL MICROPHONE:",
            microphoneSelectionError
          );
          stream.getTracks().forEach((track) => track.stop());
          throw new Error(
            "Could not access the working Microphone Array. Check Chrome microphone permission and device availability."
          );
        }

        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        // Join with microphone and camera OFF by default.
        // Keep the microphone track available but disabled so the user can
        // enable it with the normal control. Stop/remove the camera track to
        // release camera hardware until the user explicitly turns it on.
        stream.getAudioTracks().forEach((track) => {
          track.enabled = false;
        });
        stream.getVideoTracks().forEach((track) => {
          track.stop();
          stream.removeTrack(track);
        });

        streamRef.current = stream;

        console.log("LOCAL MEDIA READY:", {
          user: user?.name,
          audioTracks: stream.getAudioTracks().length,
          videoTracks: stream.getVideoTracks().length,
          audioStates: stream.getAudioTracks().map((track) => track.readyState),
          videoStates: stream.getVideoTracks().map((track) => track.readyState),
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        setMicOn(false);
        setCameraOn(false);
        setMediaError("");
      } catch (err) {
        if (!active) return;

        const mediaErr = err as DOMException;

        if (mediaErr.name === "NotAllowedError") {
          setMediaError(
            "Camera or microphone permission was denied. Allow access in your browser settings."
          );
        } else if (mediaErr.name === "NotFoundError") {
          setMediaError(
            "No camera or microphone was found on this device."
          );
        } else {
          setMediaError(
            "Unable to access your camera or microphone. Check your device settings."
          );
        }
      } finally {
        if (active) {
          setMediaLoading(false);
          setMediaInitialized(true);
        }
      }
    };
   

    startMedia();

    return () => {
      active = false;

      screenStreamRef.current?.getTracks().forEach((track) => track.stop());
      screenStreamRef.current = null;

      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  // Live microphone input meter. It analyses the actual local microphone track,
  // with a more sensitive dB-based scale so normal speaking is visible.
  useEffect(() => {
    const audioTrack = streamRef.current?.getAudioTracks().find(
      (track) => track.readyState === "live"
    );

    if (!mediaInitialized) return;

    if (!audioTrack) {
      setAudioLevel(0);
      setAudioMeterStatus("No microphone");
      return;
    }

    if (!micOn || !audioTrack.enabled) {
      setAudioLevel(0);
      setAudioMeterStatus("Muted");
      if (audioMeterFrameRef.current !== null) {
        cancelAnimationFrame(audioMeterFrameRef.current);
        audioMeterFrameRef.current = null;
      }
      void audioMeterContextRef.current?.close();
      audioMeterContextRef.current = null;
      return;
    }

    const AudioContextConstructor =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextConstructor) {
      setAudioMeterStatus("Audio meter unavailable");
      return;
    }

    let stopped = false;
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;

    const startMeter = async () => {
      try {
        setAudioMeterStatus("Listening");
        console.log("MICROPHONE METER INPUT:", {
          label: audioTrack.label,
          enabled: audioTrack.enabled,
          muted: audioTrack.muted,
          readyState: audioTrack.readyState,
          settings: audioTrack.getSettings(),
        });

        const context: AudioContext = new AudioContextConstructor();
        audioMeterContextRef.current = context;
        await context.resume();

        if (stopped) {
          await context.close();
          return;
        }

        if (context.state !== "running") {
          setAudioMeterStatus("Click Unmute to enable audio");
          return;
        }

        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.45;
        source = context.createMediaStreamSource(new MediaStream([audioTrack]));
        source.connect(analyser);

        const samples = new Float32Array(analyser.fftSize);
        let smoothedLevel = 0;

        const updateLevel = () => {
          if (stopped || !analyser) return;

          analyser.getFloatTimeDomainData(samples);
          let sum = 0;
          for (let index = 0; index < samples.length; index += 1) {
            sum += samples[index] * samples[index];
          }

          const rms = Math.sqrt(sum / samples.length);
          const decibels = rms > 0 ? 20 * Math.log10(rms) : -100;
          // Ignore very low background noise, but show ordinary/quiet speech.
          const rawLevel = Math.max(0, Math.min(100, ((decibels + 55) / 35) * 100));
          smoothedLevel = smoothedLevel * 0.55 + rawLevel * 0.45;
          const level = Math.round(smoothedLevel);

          setAudioLevel(level);
          setAudioMeterStatus(level >= 12 ? "Audio detected" : "Listening");
          audioMeterFrameRef.current = requestAnimationFrame(updateLevel);
        };

        updateLevel();
      } catch (meterError) {
        console.warn("Microphone level meter could not start:", meterError);
        setAudioLevel(0);
        setAudioMeterStatus("Microphone input unavailable");
      }
    };

    void startMeter();

    return () => {
      stopped = true;
      if (audioMeterFrameRef.current !== null) {
        cancelAnimationFrame(audioMeterFrameRef.current);
        audioMeterFrameRef.current = null;
      }
      source?.disconnect();
      analyser?.disconnect();
      if (audioMeterContextRef.current) {
        void audioMeterContextRef.current.close();
        audioMeterContextRef.current = null;
      }
    };
  }, [mediaInitialized, micOn]);

  // Load an existing AI summary whenever this meeting room is opened.
  useEffect(() => {
    if (!id) return;
    let active = true;

    const loadSummary = async () => {
      setSummaryLoading(true);
      setSummaryError("");
      try {
        const response = await api.get(`/summaries/${id}`);
        if (!active) return;
        if (response.data?.success && response.data.summary) {
          setMeetingSummary(response.data.summary);
        }
      } catch (loadError: any) {
        // A 404 simply means this meeting has not been summarized yet.
        if (active && loadError.response?.status !== 404) {
          setSummaryError(
            loadError.response?.data?.message ||
            "Could not load the saved meeting summary."
          );
        }
      } finally {
        if (active) setSummaryLoading(false);
      }
    };

    void loadSummary();
    return () => { active = false; };
  }, [id]);

  const generateMeetingSummary = async () => {
    if (!id || !isHost || summaryGenerating) return;
    setSummaryGenerating(true);
    setSummaryError("");
    try {
      const response = await api.post(`/summaries/${id}`);
      if (!response.data?.success || !response.data.summary) {
        throw new Error(response.data?.message || "The summary was not returned by the server.");
      }
      const generatedSummary = response.data.summary as MeetingSummaryData;
      setMeetingSummary(generatedSummary);

      // Notify everyone currently in this meeting. The server must validate
      // that the sender is the meeting host before relaying this event.
      socket.emit("publish-meeting-summary", {
        roomId: id,
        summary: generatedSummary,
      });
    } catch (generationError: any) {
      console.error("Meeting summary generation failed:", generationError);
      setSummaryError(
        generationError.response?.data?.message ||
        generationError.response?.data?.error ||
        generationError.message ||
        "Unable to generate the meeting summary."
      );
    } finally {
      setSummaryGenerating(false);
    }
  };

   const isHost =
    String(meeting?.createdBy?._id) === String(user?.id);

  // Screen sharers appear first. Otherwise, the meeting host appears first.
  const orderedRemoteParticipants = [...remoteParticipants].sort((a, b) => {
    const priority = (participant: RemoteParticipant) =>
      participant.isScreenSharing
        ? 0
        : participantsRef.current.get(participant.socketId)?.userId ===
            String(meeting?.createdBy?._id)
          ? 1
          : 2;

    return priority(a) - priority(b);
  });

  const localTileOrder = isScreenSharing ? 0 : isHost ? 1 : 2;

  // Get the video sender from a peer connection
  const getVideoSender = (peerConnection: RTCPeerConnection) => {
    const videoTransceiver = peerConnection
      .getTransceivers()
      .find(
        (transceiver) =>
          transceiver.receiver.track.kind === "video"
      );

    return videoTransceiver?.sender ?? null;
  };

  // Create a WebRTC peer connection
  const createPeerConnection = (participant: Participant) => {
    const existingConnection = peerConnectionsRef.current.get(
      participant.socketId
    );

    console.log("CREATING PEER CONNECTION:", {
      localUser: user?.name,
      remoteUser: participant.userName,
      mediaReady: !!streamRef.current,
      audioTracks: streamRef.current?.getAudioTracks().length ?? 0,
      videoTracks: streamRef.current?.getVideoTracks().length ?? 0,
    });

    if (existingConnection) {
      return existingConnection;
    }

    const peerConnection = new RTCPeerConnection({
      iceServers: [
        {
          urls: "stun:stun.l.google.com:19302",
        },
      ],
    });

    // Attach the initial video track with addTrack so the outgoing
    // video m-line is associated with the actual MediaStream.
    const activeVideoStream =
      screenStreamRef.current ?? streamRef.current;

    const activeVideoTrack = activeVideoStream
      ?.getVideoTracks()
      .find((track) => track.readyState === "live");

    const videoSender = activeVideoTrack && activeVideoStream
      ? peerConnection.addTrack(activeVideoTrack, activeVideoStream)
      : peerConnection.addTransceiver("video", {
          direction: "sendrecv",
        }).sender;

    const trackSetupPromise: Promise<void> = Promise.resolve().then(() => {
      console.log("OUTGOING VIDEO TRACK ATTACHED:", {
        localUser: user?.name,
        remoteUser: participant.userName,
        senderExists: Boolean(videoSender),
        trackKind: videoSender.track?.kind ?? null,
        trackState: videoSender.track?.readyState ?? null,
        trackId: videoSender.track?.id ?? null,
        streamId: activeVideoStream?.id ?? null,
      });
    });

    const audioTrack = streamRef.current
      ?.getAudioTracks()
      .find((track) => track.readyState === "live");

    if (audioTrack) {
      peerConnection.addTrack(audioTrack, streamRef.current!);
    }

    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("ice-candidate", {
          roomId: id,
          targetSocketId: participant.socketId,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      console.log("REMOTE TRACK RECEIVED:", {
        localUser: user?.name,
        participant: participant.userName,
        kind: event.track.kind,
        state: event.track.readyState,
        streams: event.streams.length,
      });

      let remoteStream = remoteStreamsRef.current.get(
        participant.socketId
      );

      if (!remoteStream) {
        remoteStream = new MediaStream();
        remoteStreamsRef.current.set(
          participant.socketId,
          remoteStream
        );
      }

      const incomingStream = event.streams[0];

      if (incomingStream) {
        incomingStream.getTracks().forEach((track) => {
          const alreadyAdded = remoteStream!
            .getTracks()
            .some((existingTrack) => existingTrack.id === track.id);

          if (!alreadyAdded) {
            remoteStream!.addTrack(track);
          }
        });
      }

      const alreadyAdded = remoteStream
        .getTracks()
        .some((track) => track.id === event.track.id);

      if (!alreadyAdded) {
        remoteStream.addTrack(event.track);
      }

      if (event.track.kind === "audio") {
        console.log("REMOTE AUDIO TRACK RECEIVED:", {
          localUser: user?.name, remoteUser: participant.userName,
          trackId: event.track.id, readyState: event.track.readyState,
          enabled: event.track.enabled, muted: event.track.muted,
          audioContextState: remotePlaybackContextRef.current?.state ?? "not-enabled",
        });
        connectRemoteAudioTrack(event.track, participant.userName);
      }

      // Refresh the participant tile when a remote track starts delivering frames.
      event.track.onunmute = () => {
        console.log("REMOTE TRACK UNMUTED:", {
          localUser: user?.name,
          remoteUser: participant.userName,
          kind: event.track.kind,
          readyState: event.track.readyState,
          muted: event.track.muted,
        });
        setRemoteParticipants((current) =>
          current.map((item) =>
            item.socketId === participant.socketId
              ? { ...item, stream: remoteStream! }
              : item
          )
        );
      };

      event.track.onmute = () => {
        console.warn("REMOTE TRACK MUTED:", {
          localUser: user?.name,
          remoteUser: participant.userName,
          kind: event.track.kind,
        });
      };

      remoteStreamsRef.current.set(
        participant.socketId,
        remoteStream
      );

      console.log("REMOTE STREAM UPDATED:", {
        participant: participant.userName,
        audioTracks: remoteStream.getAudioTracks().map((track) => ({
          id: track.id,
          state: track.readyState,
        })),
        videoTracks: remoteStream.getVideoTracks().map((track) => ({
          id: track.id,
          state: track.readyState,
        })),
      });

      // Read the latest participant status instead of values captured
      // when this peer connection was first created.
      const knownParticipant = participantsRef.current.get(participant.socketId);
      const latestMediaStatus = mediaStatusRef.current.get(participant.socketId);
      const latestParticipant: Participant = {
        ...participant,
        ...(knownParticipant ?? {}),
        ...(latestMediaStatus ?? {}),
      };

     setRemoteParticipants((current) => {
  const existing = current.find(
    (item) => item.socketId === participant.socketId
  );

  if (existing) {
    return current.map((item) =>
      item.socketId === participant.socketId
        ? {
            ...item,
            userName: participant.userName,
            stream: remoteStream!,
            micOn: latestParticipant.micOn ?? true,
            cameraOn: latestParticipant.cameraOn ?? true,
            isScreenSharing: latestParticipant.isScreenSharing ?? false,
          }
        : item
    );
  }

  return [
    ...current,
    {
      socketId: participant.socketId,
      userName: participant.userName,
      stream: remoteStream!,
      micOn: latestParticipant.micOn ?? true,
      cameraOn: latestParticipant.cameraOn ?? true,
      isScreenSharing: latestParticipant.isScreenSharing ?? false,
    },
  ];
});
    };

   peerConnection.onconnectionstatechange = () => {
  console.log(
    `Peer connection with ${participant.userName}:`,
    peerConnection.connectionState
  );

  if (peerConnection.connectionState === "connected") {



    console.log("CHECKING INCOMING VIDEO:", {
  localUser: user?.name,
  remoteUser: participant.userName,
});

window.setTimeout(async () => {
  try {
    const stats = await peerConnection.getStats();

    stats.forEach((report) => {
      if (report.type === "inbound-rtp") {
        console.log(report.kind === "audio" || report.mediaType === "audio" ? "INBOUND AUDIO RTP" : "INBOUND VIDEO RTP", {
          localUser: user?.name, remoteUser: participant.userName,
          bytesReceived: report.bytesReceived, packetsReceived: report.packetsReceived,
          audioLevel: report.audioLevel, totalAudioEnergy: report.totalAudioEnergy,
          framesReceived: report.framesReceived, framesDecoded: report.framesDecoded,
        });
        console.log("INBOUND RTP REPORT:", {
          localUser: user?.name,
          remoteUser: participant.userName,
          kind: report.kind,
          mediaType: report.mediaType,
          bytesReceived: report.bytesReceived,
          packetsReceived: report.packetsReceived,
          framesReceived: report.framesReceived,
          framesDecoded: report.framesDecoded,
        });
      }
    });
  } catch (error) {
    console.error("INCOMING STATS ERROR:", error);
  }
}, 5000);


    void peerConnection.getStats().then((stats) => {
  stats.forEach((report) => {
    if (
      report.type === "inbound-rtp" &&
      (report.kind === "video" || report.mediaType === "video")
    ) {
      console.log("INCOMING VIDEO STATISTICS:", {
        localUser: user?.name,
        remoteUser: participant.userName,
        bytesReceived: report.bytesReceived,
        packetsReceived: report.packetsReceived,
        framesReceived: report.framesReceived,
        framesDecoded: report.framesDecoded,
        framesDropped: report.framesDropped,
      });
    }
  });
}).catch((error) => {
  console.error("Incoming video stats error:", error);
});


    const videoSender = peerConnection
      .getSenders()
      .find((sender) => sender.track?.kind === "video");

    console.log("VIDEO SENDER CHECK:", {
      localUser: user?.name,
      remoteUser: participant.userName,
      senderExists: Boolean(videoSender),
      trackKind: videoSender?.track?.kind,
      trackState: videoSender?.track?.readyState,
    });

   if (videoSender) {
  window.setTimeout(async () => {
    try {
      const stats = await videoSender.getStats();

      console.log("RAHUL OUTGOING SENDER ALL STATS:", {
        localUser: user?.name,
        remoteUser: participant.userName,
        trackKind: videoSender.track?.kind,
        trackState: videoSender.track?.readyState,
        reports: Array.from(stats.values()),
      });
    } catch (error) {
      console.error("SENDER GETSTATS FAILED:", error);
    }
  }, 5000);
}
  }

  if (
    peerConnection.connectionState === "failed" ||
    peerConnection.connectionState === "closed"
  ) {
    peerConnection.close();
    peerConnectionsRef.current.delete(participant.socketId);
    remoteStreamsRef.current.delete(participant.socketId);

    setRemoteParticipants((current) =>
      current.filter(
        (item) => item.socketId !== participant.socketId
      )
    );
  }
};
    peerConnectionsRef.current.set(
      participant.socketId,
      peerConnection
    );
    peerSetupPromisesRef.current.set(
      participant.socketId,
      trackSetupPromise
    );

    peerConnection.onnegotiationneeded = () => {
      console.log("NEGOTIATION NEEDED:", {
        localUser: user?.name,
        remoteUser: participant.userName,
        signalingState: peerConnection.signalingState,
        connectionState: peerConnection.connectionState,
        senders: peerConnection.getSenders().map((sender) => ({
          kind: sender.track?.kind ?? "no-track",
          readyState: sender.track?.readyState ?? "no-track",
          trackId: sender.track?.id ?? null,
        })),
        transceivers: peerConnection.getTransceivers().map((transceiver) => ({
          kind: transceiver.receiver.track.kind,
          direction: transceiver.direction,
          currentDirection: transceiver.currentDirection,
          senderTrack: transceiver.sender.track?.kind ?? null,
        })),
      });
    };

    peerConnection.oniceconnectionstatechange = () => {
      console.log("ICE CONNECTION STATE:", {
        localUser: user?.name,
        remoteUser: participant.userName,
        state: peerConnection.iceConnectionState,
        gatheringState: peerConnection.iceGatheringState,
        signalingState: peerConnection.signalingState,
      });
    };

    return peerConnection;
  };

  // Connect to Socket.IO and manage WebRTC signaling
  useEffect(() => {
    if (!id || !user?.id) {
      console.log("Cannot join: meeting ID or user ID is missing");
      return;
    }

    if (!mediaInitialized) {
      console.log(
        "Waiting for local media initialization before joining..."
      );
      return;
    }

    let active = true;

    const createOfferForParticipant = async (participant: Participant) => {
      const localSocketId = socket.id;
      const remoteSocketId = participant.socketId;

      // One deterministic offerer per pair prevents offer glare.
      if (
        !localSocketId ||
        localSocketId.localeCompare(remoteSocketId) >= 0 ||
        offerInProgressRef.current.has(remoteSocketId)
      ) {
        return;
      }

      const peerConnection = createPeerConnection(participant);

      if (peerConnection.signalingState !== "stable") {
        return;
      }

      // Lock before the first await so duplicate room events cannot
      // start a second offer while this one is being created.
      offerInProgressRef.current.add(remoteSocketId);

      try {
        await (peerSetupPromisesRef.current.get(remoteSocketId) ??
          Promise.resolve());

        // Re-check after awaiting media setup.
        if (
          peerConnection.signalingState !== "stable" ||
          peerConnection.connectionState === "closed"
        ) {
          return;
        }

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);

        if (!peerConnection.localDescription) {
          throw new Error("Local description was not created.");
        }

        socket.emit("offer", {
          roomId: id,
          targetSocketId: remoteSocketId,
          signal: peerConnection.localDescription,
        });

        console.log("LOCAL OFFER SENT:", {
          localUser: user?.name,
          remoteUser: participant.userName,
          socketId: localSocketId,
          targetSocketId: remoteSocketId,
        });
      } catch (error) {
        console.error(
          `Error creating offer for ${participant.userName}:`,
          error
        );
      } finally {
        offerInProgressRef.current.delete(remoteSocketId);
      }
    };

    const flushPendingIceCandidates = async (
      peerConnection: RTCPeerConnection,
      remoteSocketId: string
    ) => {
      const pendingCandidates =
        pendingIceCandidatesRef.current.get(remoteSocketId) ?? [];

      pendingIceCandidatesRef.current.delete(remoteSocketId);

      for (const candidate of pendingCandidates) {
        try {
          await peerConnection.addIceCandidate(candidate);
        } catch (error) {
          console.error("Error adding queued ICE candidate:", error);
        }
      }
    };

    const handleRoomUsers = (users: Participant[]) => {
      console.log("ROOM USERS:", users);

      participantsRef.current.clear();

      const participantsWithLatestStatus = users.map((participant) => {
        const latestMediaStatus = mediaStatusRef.current.get(participant.socketId);
        const mergedParticipant = { ...participant, ...(latestMediaStatus ?? {}) };
        participantsRef.current.set(participant.socketId, mergedParticipant);
        return mergedParticipant;
      });

      setParticipants(participantsWithLatestStatus);

      participantsWithLatestStatus.forEach((participant) => {
        void createOfferForParticipant(participant);
      });
    };

    const handleUserJoined = (participant: Participant) => {
      console.log("USER JOINED:", participant);

      const latestMediaStatus = mediaStatusRef.current.get(participant.socketId);
      const participantWithLatestStatus = {
        ...participant,
        ...(latestMediaStatus ?? {}),
      };

      participantsRef.current.set(
        participant.socketId,
        participantWithLatestStatus
      );

      setParticipants((current) => {
        const alreadyExists = current.some(
          (item) => item.socketId === participant.socketId
        );

        if (alreadyExists) {
          return current.map((item) =>
            item.socketId === participant.socketId
              ? { ...item, ...participantWithLatestStatus }
              : item
          );
        }

        return [...current, participantWithLatestStatus];
      });

      void createOfferForParticipant(participantWithLatestStatus);
    };

    const handleUserLeft = (participant: Participant) => {
      console.log("USER LEFT:", participant);

      participantsRef.current.delete(participant.socketId);
      mediaStatusRef.current.delete(participant.socketId);

      const peerConnection = peerConnectionsRef.current.get(
        participant.socketId
      );

      if (peerConnection) {
        peerConnection.close();
        peerConnectionsRef.current.delete(participant.socketId);
      }

      const departedStream = remoteStreamsRef.current.get(participant.socketId);
      departedStream?.getAudioTracks().forEach((track) => {
        remoteAudioSourcesRef.current.get(track.id)?.disconnect();
        remoteAudioSourcesRef.current.delete(track.id);
        const audioElement = remoteAudioElementsRef.current.get(track.id);
        if (audioElement) {
          audioElement.pause();
          audioElement.srcObject = null;
          audioElement.remove();
          remoteAudioElementsRef.current.delete(track.id);
        }
      });
      remoteStreamsRef.current.delete(participant.socketId);
      pendingIceCandidatesRef.current.delete(participant.socketId);
      offerInProgressRef.current.delete(participant.socketId);
      peerSetupPromisesRef.current.delete(participant.socketId);

      setParticipants((current) =>
        current.filter(
          (item) => item.socketId !== participant.socketId
        )
      );

      setRemoteParticipants((current) =>
        current.filter(
          (item) => item.socketId !== participant.socketId
        )
      );
    };

    // Receive live microphone status from other participants.
    const handleMicStatus = (data: MicStatusMessage) => {
      if (!active || data.roomId !== id || data.socketId === socket.id) return;

      console.log("REMOTE MICROPHONE STATUS:", data);

      const previousStatus = mediaStatusRef.current.get(data.socketId) ?? {};
      mediaStatusRef.current.set(data.socketId, {
        ...previousStatus,
        micOn: data.micOn,
      });

      const knownParticipant = participantsRef.current.get(data.socketId);
      const updatedParticipant: Participant = {
        socketId: data.socketId,
        userId: data.userId,
        userName: data.userName,
        ...(knownParticipant ?? {}),
        micOn: data.micOn,
      };
      participantsRef.current.set(data.socketId, updatedParticipant);

      setParticipants((current) => {
        const exists = current.some((participant) => participant.socketId === data.socketId);
        return exists
          ? current.map((participant) =>
              participant.socketId === data.socketId
                ? { ...participant, micOn: data.micOn }
                : participant
            )
          : [...current, updatedParticipant];
      });

      setRemoteParticipants((current) =>
        current.map((participant) =>
          participant.socketId === data.socketId
            ? { ...participant, micOn: data.micOn }
            : participant
        )
      );
    };

    // Receive camera and screen-sharing status.
    const handleMediaStatus = (data: MediaStatusMessage) => {
      if (!active || data.roomId !== id || data.socketId === socket.id) return;

      console.log("REMOTE MEDIA STATUS:", data);

      // Cache every status first. This prevents a status event that arrives
      // before room-users/user-joined from being lost.
      const previousStatus = mediaStatusRef.current.get(data.socketId) ?? {};
      mediaStatusRef.current.set(data.socketId, {
        ...previousStatus,
        cameraOn: data.cameraOn,
        isScreenSharing: data.isScreenSharing,
      });

      const knownParticipant = participantsRef.current.get(data.socketId);
      if (knownParticipant) {
        participantsRef.current.set(data.socketId, {
          ...knownParticipant,
          cameraOn: data.cameraOn,
          isScreenSharing: data.isScreenSharing,
        });
      } else {
        participantsRef.current.set(data.socketId, {
          socketId: data.socketId,
          userId: data.userId,
          userName: data.userName,
          cameraOn: data.cameraOn,
          isScreenSharing: data.isScreenSharing,
        });
      }

      setParticipants((current) => {
        const exists = current.some((item) => item.socketId === data.socketId);
        if (!exists) {
          return [
            ...current,
            {
              socketId: data.socketId,
              userId: data.userId,
              userName: data.userName,
              cameraOn: data.cameraOn,
              isScreenSharing: data.isScreenSharing,
            },
          ];
        }

        return current.map((participant) =>
          participant.socketId === data.socketId
            ? {
                ...participant,
                cameraOn: data.cameraOn,
                isScreenSharing: data.isScreenSharing,
              }
            : participant
        );
      });

      setRemoteParticipants((current) =>
        current.map((participant) =>
          participant.socketId === data.socketId
            ? {
                ...participant,
                cameraOn: data.cameraOn,
                isScreenSharing: data.isScreenSharing,
              }
            : participant
        )
      );
    };

    // Receive an offer and create an answer
    const handleOffer = async (data: SignalMessage) => {
      if (!active || data.roomId !== id) return;

      const participant =
        participantsRef.current.get(data.senderSocketId) ?? {
          socketId: data.senderSocketId,
          userId: "",
          userName: "Participant",
        };

      participantsRef.current.set(
        participant.socketId,
        participant
      );

      const peerConnection = createPeerConnection(participant);

      try {
        const offerCollision =
          peerConnection.signalingState !== "stable";

        // The socket with the larger ID is the polite peer. In the rare
        // case of simultaneous offers, it rolls back and accepts the
        // deterministic offer from the smaller socket ID.
        const polite =
          Boolean(socket.id) &&
          socket.id!.localeCompare(data.senderSocketId) > 0;

        if (offerCollision && !polite) {
          console.warn("Ignoring colliding offer:", {
            localSocketId: socket.id,
            remoteSocketId: data.senderSocketId,
            signalingState: peerConnection.signalingState,
          });
          return;
        }

        if (offerCollision && polite) {
          await peerConnection.setLocalDescription({ type: "rollback" });
        }

        await (peerSetupPromisesRef.current.get(data.senderSocketId) ??
          Promise.resolve());

        await peerConnection.setRemoteDescription(data.signal);

        await flushPendingIceCandidates(
          peerConnection,
          data.senderSocketId
        );

        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);

        if (!peerConnection.localDescription) {
          throw new Error("Local answer was not created.");
        }

        socket.emit("answer", {
          roomId: id,
          targetSocketId: data.senderSocketId,
          signal: peerConnection.localDescription,
        });

        console.log("LOCAL ANSWER SENT:", {
          localUser: user?.name,
          remoteUser: participant.userName,
          signalingState: peerConnection.signalingState,
        });
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    // Receive an answer
    const handleAnswer = async (data: SignalMessage) => {
      if (!active || data.roomId !== id) return;

      const peerConnection = peerConnectionsRef.current.get(
        data.senderSocketId
      );

      if (!peerConnection) {
        console.error("Peer connection not found for answer");
        return;
      }

      try {
        await peerConnection.setRemoteDescription(data.signal);

        await flushPendingIceCandidates(
          peerConnection,
          data.senderSocketId
        );
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    };

    // Receive ICE candidates
    const handleIceCandidate = async (
      data: IceCandidateMessage
    ) => {
      if (!active || data.roomId !== id) return;

      const peerConnection = peerConnectionsRef.current.get(
        data.senderSocketId
      );

      if (!peerConnection) {
        const pending =
          pendingIceCandidatesRef.current.get(data.senderSocketId) ?? [];

        pending.push(data.candidate);
        pendingIceCandidatesRef.current.set(
          data.senderSocketId,
          pending
        );
        return;
      }

      if (!peerConnection.remoteDescription) {
        const pending =
          pendingIceCandidatesRef.current.get(data.senderSocketId) ?? [];

        pending.push(data.candidate);
        pendingIceCandidatesRef.current.set(
          data.senderSocketId,
          pending
        );
        return;
      }

      try {
        await peerConnection.addIceCandidate(data.candidate);
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    };

    // Receive chat messages without duplicates
    const handleReceiveMessage = (message: ChatMessage) => {
      if (!message) return;

      setMessages((current) => {
        const alreadyExists = current.some(
          (item) => item.id === message.id
        );

        if (alreadyExists) return current;

        return [...current, message];
      });
    };

    // Typing indicator
    const handleUserTyping = (participant: TypingParticipant) => {
      setTypingUsers((current) => {
        if (
          current.some(
            (item) => item.socketId === participant.socketId
          )
        ) {
          return current;
        }

        return [...current, participant];
      });
    };

    const handleUserStoppedTyping = (data: {
      socketId: string;
    }) => {
      setTypingUsers((current) =>
        current.filter((item) => item.socketId !== data.socketId)
      );
    };

    // Participants receive the host-generated summary in their own read-only
    // AI Summary panel. The server should only relay host-authenticated events.
    const handleMeetingSummaryUpdated = (data: {
      roomId: string;
      summary: MeetingSummaryData;
    }) => {
      if (!data || String(data.roomId) !== String(id) || !data.summary) return;
      setMeetingSummary(data.summary);
      setSummaryError("");
      setSummaryLoading(false);
      setSummaryGenerating(false);
    };

    const handleConnect = () => {
      if (!socket.id) return;

      if (joinedSocketIdRef.current === socket.id) {
        return;
      }

      joinedSocketIdRef.current = socket.id;

      console.log("SOCKET CONNECTED:", socket.id);

      console.log("JOINING AFTER MEDIA INITIALIZATION:", {
        mediaReady: !!streamRef.current,
        audioTracks: streamRef.current?.getAudioTracks().length ?? 0,
        videoTracks: streamRef.current?.getVideoTracks().length ?? 0,
      });

     socket.emit("join-room", {
        roomId: id,
        userId: user.id,
        userName: user.name || "Guest",
        cameraOn: cameraOnRef.current,
        isScreenSharing: isScreenSharingRef.current,
        micOn: micOnRef.current,
      });

    };

    socket.on("room-users", handleRoomUsers);
    socket.on("user-joined", handleUserJoined);
    socket.on("user-left", handleUserLeft);

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("ice-candidate", handleIceCandidate);

    socket.on("receive-message", handleReceiveMessage);
    socket.on("user-typing", handleUserTyping);
    socket.on("user-stopped-typing", handleUserStoppedTyping);
    socket.on("media-status", handleMediaStatus);
    socket.on("mic-status", handleMicStatus);
    socket.on("meeting-summary-updated", handleMeetingSummaryUpdated);

    socket.on("connect", handleConnect);

    if (socket.connected) {
      handleConnect();
    } else {
      socket.connect();
    }

    return () => {
      active = false;

      socket.off("room-users", handleRoomUsers);
      socket.off("user-joined", handleUserJoined);
      socket.off("user-left", handleUserLeft);

      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice-candidate", handleIceCandidate);

      socket.off("receive-message", handleReceiveMessage);
      socket.off("user-typing", handleUserTyping);
      socket.off("user-stopped-typing", handleUserStoppedTyping);
      socket.off("media-status", handleMediaStatus);
      socket.off("mic-status", handleMicStatus);
      socket.off("meeting-summary-updated", handleMeetingSummaryUpdated);

      socket.off("connect", handleConnect);

      joinedSocketIdRef.current = null;

      socket.emit("leave-room", {
        roomId: id,
      });

      socket.disconnect();

      peerConnectionsRef.current.forEach((peerConnection) => {
        peerConnection.close();
      });

      peerConnectionsRef.current.clear();
      participantsRef.current.clear();
      mediaStatusRef.current.clear();
      remoteStreamsRef.current.clear();
      pendingIceCandidatesRef.current.clear();
      offerInProgressRef.current.clear();
      peerSetupPromisesRef.current.clear();

      setRemoteParticipants([]);
    };
  }, [id, user?.id, user?.name, mediaInitialized]);

  // Play remote microphone tracks through dedicated native audio elements.
  // This avoids depending on an AudioContext for ordinary speaker playback.
  const connectRemoteAudioTrack = (track: MediaStreamTrack, participantName: string) => {
    if (track.kind !== "audio" || track.readyState !== "live") return;

    let audioElement = remoteAudioElementsRef.current.get(track.id);
    if (!audioElement) {
      audioElement = document.createElement("audio");
      audioElement.autoplay = true;
      // Keep newly received participant audio aligned with the speaker toggle.
      audioElement.muted = !meetingAudioEnabledRef.current;
      audioElement.volume = 1;
      audioElement.style.position = "fixed";
      audioElement.style.width = "1px";
      audioElement.style.height = "1px";
      audioElement.style.opacity = "0";
      audioElement.style.pointerEvents = "none";
      audioElement.setAttribute("aria-hidden", "true");
      document.body.appendChild(audioElement);
      audioElement.srcObject = new MediaStream([track]);
      remoteAudioElementsRef.current.set(track.id, audioElement);
      track.addEventListener("ended", () => {
        const element = remoteAudioElementsRef.current.get(track.id);
        if (element) {
          element.pause();
          element.srcObject = null;
          element.remove();
        }
        remoteAudioElementsRef.current.delete(track.id);
        remoteAudioSourcesRef.current.get(track.id)?.disconnect();
        remoteAudioSourcesRef.current.delete(track.id);
      }, { once: true });
    }

    void audioElement.play().then(() => {
      console.log("REMOTE NATIVE AUDIO PLAYING:", {
        participant: participantName, trackId: track.id,
        paused: audioElement?.paused, muted: audioElement?.muted,
        volume: audioElement?.volume,
      });
    }).catch((error) => {
      console.warn("REMOTE NATIVE AUDIO PLAY BLOCKED:", participantName, error);
    });


  };

  const enableMeetingAudio = async () => {
    try {
      // Make sure audio elements exist for every remote track already received.
      remoteStreamsRef.current.forEach((stream, socketId) => {
        const participant = participantsRef.current.get(socketId);
        stream.getAudioTracks().forEach((track) => {
          if (track.readyState === "live") {
            connectRemoteAudioTrack(track, participant?.userName || "Participant");
          }
        });
      });

      // This runs directly in the user's click/tap gesture, which is what
      // Chrome requires before allowing audible media playback.
      const playResults = await Promise.allSettled(
        Array.from(remoteAudioElementsRef.current.values()).map((element) => {
          element.muted = false;
          element.volume = 1;
          return element.play();
        })
      );
      const succeeded = playResults.filter((result) => result.status === "fulfilled").length;
      const failed = playResults.filter((result) => result.status === "rejected");

      setMeetingAudioEnabled(true);
      console.log("MEETING NATIVE AUDIO ENABLED:", {
        remoteParticipants: remoteStreamsRef.current.size,
        audioElements: remoteAudioElementsRef.current.size,
        playSucceeded: succeeded,
        playFailed: failed.length,
        failures: failed.map((result) => String(result.reason)),
      });

      if (failed.length > 0) {
        setMediaError("The browser blocked remote audio playback. Check the tab's mute setting and Windows output device, then click Enable audio again.");
      } else if (remoteAudioElementsRef.current.size === 0) {
        setMediaError("Speaker playback is enabled. Waiting for another participant's microphone audio.");
      } else {
        setMediaError("");
      }
    } catch (audioError) {
      console.error("MEETING AUDIO START FAILED:", audioError);
      setMediaError(audioError instanceof Error ? audioError.message : "Meeting audio could not start.");
    }
  };

  // Toggle only the incoming participant audio. This does not affect the local microphone.
  const toggleMeetingAudio = async () => {
    if (meetingAudioEnabled) {
      remoteAudioElementsRef.current.forEach((element) => {
        element.muted = true;
      });
      setMeetingAudioEnabled(false);
      setMediaError("");
      console.log("MEETING SPEAKER AUDIO MUTED");
      return;
    }

    await enableMeetingAudio();
  };

  useEffect(() => {
    if (!meetingAudioEnabled) return;
    remoteStreamsRef.current.forEach((stream, socketId) => {
      const participant = participantsRef.current.get(socketId);
      stream.getAudioTracks().forEach((track) => {
        if (track.readyState === "live") {
          connectRemoteAudioTrack(track, participant?.userName || "Participant");
        }
      });
    });
  }, [remoteParticipants, meetingAudioEnabled]);

  const formatRecordingTime = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return [hours, minutes, seconds].map((value) => String(value).padStart(2, "0")).join(":");
  };

  const stopMeetingRecording = () => {
    if (!isHost) {
      setRecordingError("Only the meeting host can control recording.");
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
  };

  const startMeetingRecording = async () => {
    if (!isHost) {
      setRecordingError("Only the meeting host can control recording.");
      return;
    }

    if (isRecording) return;
    setRecordingError("");

    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRecordingError("Meeting recording is not supported in this browser.");
      return;
    }

    let audioContext: AudioContext | null = null;
    try {
      const stage = document.querySelector<HTMLElement>(".meeting-room-stage");
      if (!stage) throw new Error("The meeting stage could not be found.");

      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      recordingCanvasRef.current = canvas;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not initialize the recording canvas.");

      let attachNewAudioTracks = () => {};
      const drawFrame = () => {
        attachNewAudioTracks();
        const width = canvas.width;
        const height = canvas.height;
        context.fillStyle = "#111827";
        context.fillRect(0, 0, width, height);

        const tiles = Array.from(stage.querySelectorAll<HTMLElement>(".meeting-video-area"));
        const featuredTile = tiles.find((tile) => tile.dataset.recordingFeatured === "true");
        const orderedTiles = featuredTile ? [featuredTile, ...tiles.filter((tile) => tile !== featuredTile)] : tiles;

        if (orderedTiles.length > 0) {
          const featured = Boolean(featuredTile);
          const columns = featured && orderedTiles.length > 1 ? 2 : Math.ceil(Math.sqrt(orderedTiles.length));
          const rows = Math.ceil(orderedTiles.length / columns);
          const gap = 24;
          const tileWidth = (width - gap * (columns + 1)) / columns;
          const tileHeight = (height - gap * (rows + 1)) / rows;

          orderedTiles.forEach((tile, index) => {
            let x = gap + (index % columns) * (tileWidth + gap);
            let y = gap + Math.floor(index / columns) * (tileHeight + gap);
            let w = tileWidth;
            let h = tileHeight;
            if (featured && index === 0 && orderedTiles.length > 1) {
              w = Math.min(width - gap * 2, tileWidth * 1.55);
              h = Math.min(height - gap * 2, tileHeight * 1.55);
              x = (width - w) / 2;
              y = gap;
            }

            context.save();
            context.fillStyle = "#1f2937";
            context.fillRect(x, y, w, h);
            const video = tile.querySelector<HTMLVideoElement>("video");
            if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0 && video.videoHeight > 0) {
              const sourceRatio = video.videoWidth / video.videoHeight;
              const targetRatio = w / h;
              let sx = 0, sy = 0, sw = video.videoWidth, sh = video.videoHeight;
              if (sourceRatio > targetRatio) {
                sw = video.videoHeight * targetRatio;
                sx = (video.videoWidth - sw) / 2;
              } else {
                sh = video.videoWidth / targetRatio;
                sy = (video.videoHeight - sh) / 2;
              }
              // Match the local mirrored camera preview; remote feeds and screen shares remain unmirrored.
              const isLocalCamera = video === videoRef.current && !isScreenSharingRef.current;
              if (isLocalCamera) {
                context.translate(x + w, y);
                context.scale(-1, 1);
                context.drawImage(video, sx, sy, sw, sh, 0, 0, w, h);
              } else {
                context.drawImage(video, sx, sy, sw, sh, x, y, w, h);
              }
            } else {
              const avatar = tile.querySelector<HTMLElement>(".meeting-video-avatar")?.textContent?.trim() || "?";
              context.fillStyle = "#a5b4fc";
              context.font = "bold 88px Arial";
              context.textAlign = "center";
              context.textBaseline = "middle";
              context.fillText(avatar.slice(0, 1), x + w / 2, y + h / 2);
            }

            const name = tile.querySelector<HTMLElement>(".meeting-video-name")?.textContent?.trim() || "Participant";
            context.fillStyle = "rgba(15, 23, 42, 0.78)";
            context.fillRect(x + 12, y + h - 58, Math.min(w - 24, 520), 42);
            context.fillStyle = "#ffffff";
            context.font = "28px Arial";
            context.textAlign = "left";
            context.textBaseline = "middle";
            context.fillText(name.slice(0, 48), x + 26, y + h - 37, Math.min(w - 52, 480));
            context.restore();
          });
        } else {
          context.fillStyle = "#ffffff";
          context.font = "48px Arial";
          context.textAlign = "center";
          context.fillText("IntellMeet Meeting Recording", width / 2, height / 2);
        }
        recordingAnimationRef.current = requestAnimationFrame(drawFrame);
      };
      drawFrame();

      const canvasStream = canvas.captureStream(30);
      const outputTracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];

      const AudioContextConstructor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Audio mixing is not supported in this browser.");
      audioContext = new AudioContextConstructor();
      await audioContext.resume();
      const destination = audioContext.createMediaStreamDestination();
      recordingAudioContextRef.current = audioContext;
      recordingAudioDestinationRef.current = destination;
      const connectedAudioTrackIds = new Set<string>();
      attachNewAudioTracks = () => {
        const currentAudioTracks = [
          ...(streamRef.current?.getAudioTracks() ?? []),
          ...Array.from(remoteStreamsRef.current.values()).flatMap((stream) => stream.getAudioTracks()),
        ];
        currentAudioTracks.forEach((track) => {
          if (track.readyState !== "live" || connectedAudioTrackIds.has(track.id)) return;
          const source = audioContext!.createMediaStreamSource(new MediaStream([track]));
          source.connect(destination);
          connectedAudioTrackIds.add(track.id);
        });
      };
      attachNewAudioTracks();
      outputTracks.push(...destination.stream.getAudioTracks());

      // Keep a separate audio-only recording for Gemini transcription.
      // It uses the same mixed local + remote audio destination as the video recording.
      const audioOnlyMimeType = ["audio/webm;codecs=opus", "audio/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      if (!audioOnlyMimeType) {
        throw new Error("Audio-only WebM recording is not supported in this browser.");
      }
      const audioOnlyRecorder = new MediaRecorder(destination.stream, {
        mimeType: audioOnlyMimeType,
      });
      audioOnlyChunksRef.current = [];
      audioOnlyRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioOnlyChunksRef.current.push(event.data);
      };
      audioOnlyRecorder.onerror = (event) => {
        console.error("Audio-only recording error:", event);
        setTranscriptionError("The audio recording encountered an error.");
        setTranscriptionStatus("failed");
      };
      audioOnlyRecorder.onstop = async () => {
        const audioBlob = new Blob(audioOnlyChunksRef.current, {
          type: audioOnlyRecorder.mimeType || "audio/webm",
        });
        audioOnlyChunksRef.current = [];
        audioOnlyRecorderRef.current = null;

        if (!audioBlob.size) {
          setTranscriptionStatus("failed");
          setTranscriptionError("No audio was captured for transcription.");
          recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
          recordingAudioDestinationRef.current = null;
          void recordingAudioContextRef.current?.close();
          recordingAudioContextRef.current = null;
          return;
        }

        // The backend accepts files up to 14 MB.
        if (audioBlob.size > 14 * 1024 * 1024) {
          setTranscriptionStatus("failed");
          setTranscriptionError("This audio recording exceeds the 14 MB upload limit. Record a shorter meeting or add chunked uploads.");
          recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
          recordingAudioDestinationRef.current = null;
          void recordingAudioContextRef.current?.close();
          recordingAudioContextRef.current = null;
          return;
        }

        if (!id) {
          setTranscriptionStatus("failed");
          setTranscriptionError("Meeting ID is missing; audio cannot be transcribed.");
          recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
          recordingAudioDestinationRef.current = null;
          void recordingAudioContextRef.current?.close();
          recordingAudioContextRef.current = null;
          return;
        }

        try {
          setTranscriptionStatus("uploading");
          setTranscriptionError("");
          const formData = new FormData();
          formData.append(
            "audio",
            new File([audioBlob], `IntellMeet-${id}-${Date.now()}.webm`, {
              type: "audio/webm",
            })
          );

          const response = await api.post(`/transcriptions/${id}`, formData);
          const savedTranscript = response.data?.transcript?.text;
          if (!response.data?.success || typeof savedTranscript !== "string" || !savedTranscript.trim()) {
            throw new Error(response.data?.message || "The server did not return transcript text.");
          }
          setTranscriptText(savedTranscript.trim());
          setTranscriptionStatus("completed");
          recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
          recordingAudioDestinationRef.current = null;
          void recordingAudioContextRef.current?.close();
          recordingAudioContextRef.current = null;
        } catch (uploadError: any) {
          console.error("Automatic meeting transcription failed:", uploadError);
          setTranscriptionStatus("failed");
          setTranscriptionError(
            uploadError.response?.data?.message ||
            uploadError.message ||
            "Unable to transcribe this meeting recording."
          );
          recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
          recordingAudioDestinationRef.current = null;
          void recordingAudioContextRef.current?.close();
          recordingAudioContextRef.current = null;
        }
      };
      audioOnlyRecorder.start(1000);
      audioOnlyRecorderRef.current = audioOnlyRecorder;
      setTranscriptText("");
      setTranscriptionError("");
      setTranscriptionStatus("idle");

      const recordingStream = new MediaStream(outputTracks);
      const mimeType = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(recordingStream, mimeType ? { mimeType } : undefined);
      recordingChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };
      recorder.onerror = (event) => {
        console.error("Meeting recording error:", event);
        setRecordingError("The recording encountered an error.");
      };
      recorder.onstop = () => {
        const blob = new Blob(recordingChunksRef.current, { type: recorder.mimeType || "video/webm" });
        if (blob.size > 0) {
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = `IntellMeet-${meeting?.title?.replace(/[^a-z0-9-_]+/gi, "-") || "Meeting"}-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        }
        setIsRecording(false);
        setRecordingSeconds(0);
        recordingStartedAtRef.current = null;
        if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
        if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
        recordingAnimationRef.current = null;
        recordingCanvasRef.current = null;
        // Stop the audio-only recorder after the video recorder has finalized.
        // Its onstop handler uploads the completed audio to the transcription API.
        if (audioOnlyRecorderRef.current && audioOnlyRecorderRef.current.state !== "inactive") {
          audioOnlyRecorderRef.current.stop();
        }
        canvasStream.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current = null;
      };

      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = window.setInterval(() => {
        if (recordingStartedAtRef.current) {
          setRecordingSeconds(Math.floor((Date.now() - recordingStartedAtRef.current) / 1000));
        }
      }, 1000);
    } catch (error) {
      console.error("Unable to start meeting recording:", error);
      setRecordingError(error instanceof Error ? error.message : "Unable to start meeting recording.");
      if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
      recordingAnimationRef.current = null;
      recordingCanvasRef.current = null;
      if (audioOnlyRecorderRef.current && audioOnlyRecorderRef.current.state !== "inactive") {
        audioOnlyRecorderRef.current.stop();
      }
      if (audioContext) void audioContext.close();
      recordingAudioContextRef.current = null;
      recordingAudioDestinationRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") recorder.stop();
      const audioRecorder = audioOnlyRecorderRef.current;
      if (audioRecorder && audioRecorder.state !== "inactive") audioRecorder.stop();
      if (recordingTimerRef.current !== null) window.clearInterval(recordingTimerRef.current);
      if (recordingAnimationRef.current !== null) cancelAnimationFrame(recordingAnimationRef.current);
      recordingAudioDestinationRef.current?.stream.getTracks().forEach((track) => track.stop());
      recordingAudioDestinationRef.current = null;
      void recordingAudioContextRef.current?.close();
      recordingAudioContextRef.current = null;
      remoteAudioSourcesRef.current.forEach((source) => source.disconnect());
      remoteAudioSourcesRef.current.clear();
      remoteAudioElementsRef.current.forEach((element) => {
        element.pause();
        element.srcObject = null;
        element.remove();
      });
      remoteAudioElementsRef.current.clear();
      remotePlaybackContextRef.current = null;
    };
  }, []);

  // Toggle microphone
  const toggleMicrophone = () => {
    const audioTracks = streamRef.current?.getAudioTracks() ?? [];

    if (audioTracks.length === 0) {
      setMediaError("No microphone track is available.");
      return;
    }

    const nextState = !micOn;

    audioTracks.forEach((track) => {
      track.enabled = nextState;
    });

    micOnRef.current = nextState;
    setMicOn(nextState);
    socket.emit("mic-status", {
      roomId: id,
      micOn: nextState,
    });
  };

  // Toggle camera and release the physical camera device when turning it off.
  const toggleCamera = async () => {
    try {
      if (cameraOn) {
        const cameraTracks = streamRef.current?.getVideoTracks() ?? [];

        // Stop sending camera frames first. Keep the video transceiver alive.
        if (!screenStreamRef.current) {
          await Promise.all(
            Array.from(peerConnectionsRef.current.entries()).map(
              async ([socketId, peerConnection]) => {
                const videoSender = getVideoSender(peerConnection);

                if (videoSender) {
                  await videoSender.replaceTrack(null);
                  console.log("CAMERA DETACHED FROM PEER:", socketId);
                }
              }
            )
          );
        }

        // Release the physical camera device.
        cameraTracks.forEach((track) => {
          track.stop();
          streamRef.current?.removeTrack(track);
        });

        cameraOnRef.current = false;
        setCameraOn(false);

        socket.emit("media-status", {
          roomId: id,
          cameraOn: false,
          isScreenSharing: Boolean(screenStreamRef.current),
        });

        console.log("CAMERA OFF: hardware track stopped and removed");
        return;
      }

      // Acquire a fresh camera track after it has been released.
      const newCameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });

      const newCameraTrack = newCameraStream.getVideoTracks()[0];

      if (!newCameraTrack || !streamRef.current) {
        newCameraStream.getTracks().forEach((track) => track.stop());
        throw new Error("Could not acquire a new camera track.");
      }

      streamRef.current.addTrack(newCameraTrack);

      // If screen sharing is active, keep sending the screen.
      // Otherwise, restore the camera track on every peer connection.
      if (!screenStreamRef.current) {
        await Promise.all(
          Array.from(peerConnectionsRef.current.entries()).map(
            async ([socketId, peerConnection]) => {
              const videoSender = getVideoSender(peerConnection);

              if (videoSender) {
                await videoSender.replaceTrack(newCameraTrack);

                console.log("CAMERA RESTORED TO PEER:", {
                  socketId,
                  trackId: newCameraTrack.id,
                  readyState: newCameraTrack.readyState,
                });
              }
            }
          )
        );

        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;

          void videoRef.current.play().catch((error) => {
            console.warn("Local camera preview could not play:", error);
          });
        }
      }

      cameraOnRef.current = true;
      setCameraOn(true);
      setMediaError("");

      socket.emit("media-status", {
        roomId: id,
        cameraOn: true,
        isScreenSharing: Boolean(screenStreamRef.current),
      });
    } catch (error) {
      console.error("Camera toggle error:", error);
      setMediaError(
        "Unable to turn the camera on or off. Check camera permissions."
      );
    }
  };

  // Stop screen sharing and restore the camera only if it is currently on.
  const stopScreenSharing = async () => {
    const screenStream = screenStreamRef.current;

    if (!screenStream) return;

    const cameraIsCurrentlyOn = cameraOnRef.current;

    const cameraTrack =
      streamRef.current
        ?.getVideoTracks()
        .find((track) => track.readyState === "live") ?? null;

    // Restore the camera (or detach video) before stopping screen capture.
    await Promise.all(
      Array.from(peerConnectionsRef.current.entries()).map(
        async ([socketId, peerConnection]) => {
          const videoSender = getVideoSender(peerConnection);

          if (!videoSender) return;

          try {
            await videoSender.replaceTrack(
              cameraIsCurrentlyOn && cameraTrack ? cameraTrack : null
            );

            console.log("SCREEN SHARE STOPPED - SOURCE RESTORED:", {
              socketId,
              cameraRestored: Boolean(cameraIsCurrentlyOn && cameraTrack),
            });
          } catch (error) {
            console.error(
              `Could not restore video source for peer ${socketId}:`,
              error
            );
          }
        }
      )
    );

    screenStreamRef.current = null;

    screenStream.getTracks().forEach((track) => {
      track.onended = null;
      track.stop();
    });

    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;

      if (cameraIsCurrentlyOn && cameraTrack) {
        void videoRef.current.play().catch((error) => {
          console.warn("Local camera preview could not resume:", error);
        });
      }
    }

    isScreenSharingRef.current = false;
    setIsScreenSharing(false);

    socket.emit("media-status", {
      roomId: id,
      cameraOn: cameraOnRef.current,
      isScreenSharing: false,
    });
  };

  // Start or stop screen sharing
  const toggleScreenSharing = async () => {
    if (screenStreamRef.current) {
      await stopScreenSharing();
      return;
    }

    try {
      const screenStream =
        await navigator.mediaDevices.getDisplayMedia({
          video: {
            frameRate: { ideal: 15, max: 30 },
          },
          audio: false,
        });

      const screenTrack = screenStream.getVideoTracks()[0];

      if (!screenTrack || screenTrack.readyState !== "live") {
        screenStream.getTracks().forEach((track) => track.stop());
        return;
      }

      const replacementResults = await Promise.all(
        Array.from(peerConnectionsRef.current.entries()).map(
          async ([socketId, peerConnection]) => {
            const videoSender = getVideoSender(peerConnection);

            if (!videoSender) {
              console.error(
                "No video sender found for peer:",
                socketId
              );
              return false;
            }

            try {
              await videoSender.replaceTrack(screenTrack);

              console.log("SCREEN TRACK REPLACED:", {
                socketId,
                screenTrackId: screenTrack.id,
                screenTrackState: screenTrack.readyState,
                senderTrackId: videoSender.track?.id,
              });

              return true;
            } catch (error) {
              console.error(
                `Screen track replacement failed for ${socketId}:`,
                error
              );
              return false;
            }
          }
        )
      );

      console.log("SCREEN SHARE REPLACEMENT RESULTS:", {
        peers: replacementResults.length,
        successful: replacementResults.filter(Boolean).length,
        failed: replacementResults.filter((result) => !result).length,
      });

      screenStreamRef.current = screenStream;

      if (videoRef.current) {
        videoRef.current.srcObject = screenStream;

        void videoRef.current.play().catch((error) => {
          console.warn("Screen preview could not play:", error);
        });
      }

      screenTrack.onended = () => {
        void stopScreenSharing();
      };

      isScreenSharingRef.current = true;
      setIsScreenSharing(true);

      socket.emit("media-status", {
        roomId: id,
        cameraOn: cameraOnRef.current,
        isScreenSharing: true,
      });
    } catch (error) {
      console.error("Screen sharing error:", error);
      setMediaError("Unable to start screen sharing.");
    }
  };

  // Handle chat typing
  const handleMessageChange = (value: string) => {
    if (!messageInput.trim() && value.trim()) {
      socket.emit("typing-start", { roomId: id });
    }

    if (messageInput.trim() && !value.trim()) {
      socket.emit("typing-stop", { roomId: id });
    }

    setMessageInput(value);
  };

  // Send chat message
  const sendMessage = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedMessage = messageInput.trim();

    if (!trimmedMessage || !id || !socket.connected) return;

    socket.emit("send-message", {
      roomId: id,
      message: trimmedMessage,
    });

    setMessageInput("");
    socket.emit("typing-stop", { roomId: id });
  };

  // Log out
  const handleLogout = () => {
    stopMeetingRecording();
    socket.disconnect();

    peerConnectionsRef.current.forEach((peerConnection) => {
      peerConnection.close();
    });

    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    logout();
    navigate("/login");
  };

  // Leave meeting
  const leaveMeeting = () => {
    stopMeetingRecording();
    socket.emit("leave-room", {
      roomId: id,
    });

    socket.disconnect();

    peerConnectionsRef.current.forEach((peerConnection) => {
      peerConnection.close();
    });

    peerConnectionsRef.current.clear();
    pendingIceCandidatesRef.current.clear();

    screenStreamRef.current?.getTracks().forEach((track) => track.stop());
    screenStreamRef.current = null;

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    navigate(`/meetings/${meeting?._id}`);
  };

  if (loading) {
    return (
      <div className="meeting-room-loading">
        <p>Loading meeting room...</p>
      </div>
    );
  }

  console.log("MEETING DETAILS:", meeting);
  console.log("LOGGED-IN USER:", user);

  if (!meeting) {
    return (
      <div className="meeting-room-loading">
        <h2>Meeting room unavailable</h2>
        <p>{error || "This meeting could not be found."}</p>

        <button onClick={() => navigate("/dashboard")}>
          Back to dashboard
        </button>
      </div>
    );

   
  }

  return (
    <div className="meeting-room-page">
      <style>{`
        .meeting-room-page {
          min-height: 100vh;
          background: radial-gradient(circle at 12% 0%, rgba(99,102,241,.12), transparent 30%), #f3f5fb !important;
          color: #172033;
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        }
        .meeting-room-header {
          position: sticky; top: 0; z-index: 20;
          display: flex; align-items: center; gap: 22px;
          padding: 14px clamp(16px, 3vw, 38px) !important;
          background: rgba(255,255,255,.88) !important;
          border-bottom: 1px solid rgba(148,163,184,.22);
          box-shadow: 0 8px 28px rgba(15,23,42,.045);
          backdrop-filter: blur(16px);
        }
        .meeting-room-brand { gap: 10px; font-weight: 800; letter-spacing: -.4px; color: #18213a; }
        .meeting-room-brand-icon {
          display: grid; place-items: center; width: 38px; height: 38px;
          border-radius: 12px; color: white !important; font-weight: 800;
          background: linear-gradient(135deg,#6366f1,#8b5cf6) !important;
          box-shadow: 0 7px 16px rgba(99,102,241,.28);
        }
        .meeting-room-header-info { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
        .meeting-room-header-info strong { color: #202a44; font-size: 14px; }
        .meeting-room-header-info span { color: #8791a5; font-size: 11px; }
        .meeting-room-back {
          margin-left: auto; border: 1px solid #e1e6f0 !important; border-radius: 10px !important;
          padding: 9px 14px !important; background: #fff !important; color: #475569 !important;
          font-weight: 650; transition: .2s ease; cursor: pointer;
        }
        .meeting-room-back:hover { border-color: #a5b4fc !important; color: #4f46e5 !important; transform: translateY(-1px); }
        .meeting-room-main {
          display: grid !important; grid-template-columns: minmax(0,1fr) minmax(300px,350px) !important;
          align-items: start; gap: 22px !important; width: min(1600px,100%);
          margin: 0 auto !important; padding: 24px clamp(14px,2.5vw,32px) 30px !important;
        }
        .meeting-room-stage, .meeting-room-participants {
          border: 1px solid rgba(226,232,240,.9) !important; border-radius: 20px !important;
          background: rgba(255,255,255,.94) !important;
          box-shadow: 0 14px 40px rgba(31,41,74,.07) !important;
        }
        .meeting-room-stage { min-width: 0; padding: clamp(14px,2vw,24px) !important; }
        .meeting-room-stage-top {
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          padding: 2px 2px 18px; color: #29334d; font-size: 13px; font-weight: 750;
        }
        .meeting-room-stage-top > div:first-child { display:flex; align-items:center; gap:9px; }
        .meeting-live-dot { width: 8px; height: 8px; border-radius: 50%; background:#22c55e; box-shadow:0 0 0 4px rgba(34,197,94,.12); }
        .meeting-room-stage-label { color:#8791a5; font-size:11px; font-weight:650; }
        .meeting-record-button {
          display:inline-flex; align-items:center; gap:8px; padding:9px 13px;
          border:1px solid #e4e7ef; border-radius:10px; background:#fff; color:#475569;
          font-size:12px; font-weight:750; cursor:pointer; transition:.2s ease;
        }
        .meeting-record-button:hover { transform:translateY(-1px); box-shadow:0 7px 16px rgba(15,23,42,.08); }
        .meeting-record-button.is-recording { color:#dc2626; border-color:#fecaca; background:#fff5f5; }
        .meeting-video-grid { gap:14px !important; }
        .meeting-video-area {
          border-radius:15px !important; overflow:hidden; background:#172033 !important;
          box-shadow:0 8px 22px rgba(15,23,42,.13); outline:1px solid rgba(148,163,184,.16);
        }
        .meeting-video-area video { border-radius:15px; }
        .meeting-video-name {
          position:absolute; left:10px; right:10px; bottom:10px;
          display:flex; align-items:center; justify-content:space-between; gap:8px;
          padding:8px 11px; border:1px solid rgba(255,255,255,.12); border-radius:9px;
          background:rgba(15,23,42,.68) !important; color:#fff !important;
          font-size:11px; font-weight:650; backdrop-filter:blur(10px);
        }
        .meeting-video-placeholder { background: radial-gradient(circle at 50% 35%,#354064,#151c30) !important; color:#fff !important; }
        .meeting-video-avatar, .meeting-participant-avatar {
          display:grid; place-items:center; border-radius:50%; font-weight:800;
          background:linear-gradient(135deg,#6366f1,#a78bfa) !important; color:white !important;
        }
        .meeting-room-controls {
          display:flex; align-items:flex-start; justify-content:center; flex-wrap:wrap; gap:12px !important;
          margin:20px auto 2px !important; padding:12px 14px !important;
          width:fit-content; max-width:100%; border:1px solid #e8ebf2; border-radius:16px;
          background:#f8f9fd; box-shadow:inset 0 1px 0 #fff;
        }
        .meeting-control-button {
          min-width:66px; min-height:62px; border:1px solid #e5e9f1 !important;
          border-radius:12px !important; background:#fff !important; color:#475569 !important;
          box-shadow:0 3px 9px rgba(15,23,42,.04); transition:.18s ease; cursor:pointer;
        }
        .meeting-control-button:hover { transform:translateY(-2px); box-shadow:0 8px 16px rgba(15,23,42,.09); }
        .meeting-control-button:focus:not(:focus-visible) { outline:none !important; }
        .meeting-control-button:focus-visible { outline:3px solid rgba(99,102,241,.28) !important; outline-offset:2px; }
        .meeting-control-button span { font-size:19px; }
        .meeting-control-button small { display:block; margin-top:4px; font-size:10px; font-weight:700; }
        .meeting-control-button.control-off { background:#fff1f2 !important; border-color:#fecdd3 !important; color:#e11d48 !important; }
        .meeting-control-button.meeting-leave-button { background:#ef4444 !important; color:#fff !important; border-color:#ef4444 !important; }
        .meeting-mic-control-wrap { display:flex; flex:0 0 66px; flex-direction:column; align-items:center; justify-content:flex-start; gap:5px; min-width:66px; }
        .meeting-audio-meter { display:flex; align-items:center; justify-content:center; gap:3px; width:58px; height:15px; padding:2px 6px; border-radius:999px; background:#e9f7ef; overflow:hidden; }
        .meeting-audio-meter span { display:block; width:4px; min-height:3px; border-radius:999px; background:#16a36a; transition:height .08s linear, background .12s ease; }
        .meeting-audio-meter.is-muted { background:#fff1f2; }
        .meeting-audio-meter.is-muted span { background:#f43f5e; }
        .meeting-audio-meter-label { min-height:11px; color:#8490a3; font-size:9px; line-height:1; font-weight:650; white-space:nowrap; }
        .meeting-room-participants { padding:20px !important; min-width:0; }
        .meeting-participants-heading { padding-bottom:15px; border-bottom:1px solid #eef0f5; }
        .meeting-participants-heading h3 { color:#202a44; font-size:15px; }
        .meeting-participants-heading p { color:#929bad; font-size:11px; }
        .meeting-participant-count { background:#eef2ff !important; color:#4f46e5 !important; border-radius:9px !important; font-weight:800; }
        .meeting-participant-list { gap:9px; }
        .meeting-participant-item { padding:10px !important; border:1px solid #edf0f5; border-radius:12px; background:#fbfcff; }
        .meeting-participant-info strong { color:#29334d; font-size:12px; }
        .meeting-participant-info span { color:#929bad; font-size:10px; }
        .meeting-participants-footer { margin-top:16px; padding:12px !important; border-radius:12px; background:#f5f6ff !important; color:#68718b; }
        .meeting-media-error { margin:12px 0; padding:11px 13px; border-radius:10px; background:#fff1f2; color:#be123c; border:1px solid #fecdd3; font-size:12px; }
        .meeting-audio-status-button { display:inline-flex; align-items:center; gap:8px; min-height:34px; padding:7px 11px; border:1px solid #dbe3f0; border-radius:999px; background:#fff; color:#475569; box-shadow:0 2px 7px rgba(15,23,42,.05); font:600 12px/1 inherit; letter-spacing:.01em; white-space:nowrap; cursor:pointer; transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
        .meeting-audio-status-button:hover { transform:translateY(-1px); box-shadow:0 5px 12px rgba(15,23,42,.09); }
        .meeting-audio-status-button:focus-visible { outline:3px solid rgba(99,102,241,.25); outline-offset:2px; }
        .meeting-audio-status-button.is-enabled { border-color:#bbf7d0; background:#f0fdf4; color:#15803d; }
        .meeting-audio-status-button.is-disabled { border-color:#c7d2fe; background:#eef2ff; color:#4338ca; }
        .meeting-audio-status-icon { display:inline-flex; align-items:center; justify-content:center; width:19px; height:19px; border-radius:50%; background:rgba(255,255,255,.8); font-size:12px; font-weight:800; }
        .meeting-audio-status-indicator { width:7px; height:7px; flex:0 0 7px; border-radius:50%; background:#94a3b8; }
        .meeting-audio-status-button.is-enabled .meeting-audio-status-indicator { background:#22c55e; box-shadow:0 0 0 3px rgba(34,197,94,.12); }
        .meeting-audio-status-button.is-disabled .meeting-audio-status-indicator { background:#818cf8; }
        .meeting-room-footer { display:flex; justify-content:space-between; gap:12px; padding:15px clamp(16px,3vw,38px) !important; color:#929bad; font-size:11px; border-top:1px solid #e7eaf1; background:rgba(255,255,255,.7); }
        .meeting-room-sidebar-stack {
          display: flex; flex-direction: column; align-items: stretch; gap: 16px;
          min-width: 0; width: 100%;
        }
        .meeting-sidebar-tabs { display:flex; flex-wrap:wrap; gap:7px; padding:7px; border:1px solid rgba(255,255,255,.9); border-radius:16px; background:rgba(255,255,255,.72); box-shadow:0 8px 24px rgba(88,65,120,.07); backdrop-filter:blur(18px); }
        .meeting-sidebar-tab { display:inline-flex; align-items:center; justify-content:center; gap:7px; flex:1 1 auto; min-width:0; min-height:39px; padding:8px 10px; border:1px solid transparent; border-radius:11px; background:transparent; color:#68718b; font:700 11px/1.2 inherit; cursor:pointer; transition:all .18s ease; }
        .meeting-sidebar-tab:hover { background:rgba(139,92,246,.08); color:#6d28d9; }
        .meeting-sidebar-tab.is-active { color:#6d28d9; border-color:rgba(196,181,253,.55); background:linear-gradient(135deg,rgba(245,208,254,.72),rgba(221,214,254,.78)); box-shadow:0 4px 12px rgba(139,92,246,.10); }
        .meeting-sidebar-tab-panel { display:none !important; }
        .meeting-sidebar-tab-panel.is-active { display:block !important; }
        @media (max-width:620px) { .meeting-sidebar-tabs { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); } .meeting-sidebar-tab { width:100%; } }
        .meeting-room-sidebar-stack > .meeting-room-participants,
        .meeting-room-sidebar-stack > .meeting-side-card {
          width: 100%; min-width: 0; box-sizing: border-box;
          border: 1px solid rgba(255,255,255,.9); border-radius: 22px;
          background: rgba(255,255,255,.82);
          box-shadow: 0 16px 42px rgba(88,65,120,.09), inset 0 1px 0 rgba(255,255,255,.95);
          backdrop-filter: blur(22px) saturate(140%);
        }
        .meeting-room-sidebar-stack > .meeting-room-participants { padding: 20px !important; }
        .meeting-room-sidebar-stack > .meeting-side-card { padding: 18px !important; }
        .meeting-chat-card > section,
        .meeting-transcript-card > section {
          margin: 0 !important; padding: 0 !important; border: 0 !important;
          width: 100% !important; min-width: 0 !important;
        }
        .meeting-chat-card h3, .meeting-transcript-card h3 { color: #25213b !important; }
        @media (max-width: 980px) {
          .meeting-room-sidebar-stack { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); }
          .meeting-room-sidebar-stack > .meeting-room-participants { grid-column: 1 / -1; }
        }
        @media (max-width: 620px) {
          .meeting-room-sidebar-stack { display: flex; }
        }
        @media (max-width: 980px) { .meeting-room-main { grid-template-columns:1fr !important; } .meeting-room-participants { width:auto !important; } }
        @media (max-width: 560px) { .meeting-room-header { gap:10px; flex-wrap:wrap; } .meeting-room-header-info { order:3; width:100%; } .meeting-room-main { padding:12px !important; gap:14px !important; } .meeting-room-stage,.meeting-room-participants { border-radius:15px !important; } .meeting-room-controls { width:100%; gap:7px !important; } .meeting-control-button { min-width:57px; } }

        /* Premium gradient meeting workspace */
        .meeting-room-page{position:relative;isolation:isolate;overflow-x:hidden;background:radial-gradient(ellipse at 8% 18%,rgba(244,114,182,.24),transparent 34%),radial-gradient(ellipse at 92% 8%,rgba(167,139,250,.28),transparent 35%),radial-gradient(ellipse at 70% 95%,rgba(251,191,173,.22),transparent 38%),linear-gradient(135deg,#f7eafa 0%,#f5edff 42%,#fff0e9 100%)!important}
        .meeting-room-page:before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:linear-gradient(90deg,rgba(139,92,246,.08),transparent 18%,transparent 82%,rgba(236,72,153,.07))}
        .meeting-room-header{padding:16px clamp(18px,4vw,54px)!important;background:rgba(255,255,255,.66)!important;border-bottom:1px solid rgba(255,255,255,.8)!important;box-shadow:0 8px 30px rgba(90,65,125,.055)!important;backdrop-filter:blur(22px) saturate(140%)!important}
        .meeting-room-brand-icon{width:42px!important;height:42px!important;border-radius:14px!important;background:linear-gradient(140deg,#ec4899,#8b5cf6)!important;box-shadow:0 9px 22px rgba(168,85,247,.25)!important}
        .meeting-room-main{width:min(1500px,100%)!important;grid-template-columns:minmax(0,1.75fr) minmax(310px,.85fr)!important;gap:18px!important;padding:clamp(18px,3vw,38px) clamp(14px,3.5vw,48px) 34px!important;align-items:stretch!important}
        .meeting-room-stage,.meeting-room-participants{border:1px solid rgba(255,255,255,.88)!important;border-radius:26px!important;background:rgba(255,255,255,.76)!important;box-shadow:0 22px 60px rgba(88,65,120,.11),inset 0 1px 0 rgba(255,255,255,.95)!important;backdrop-filter:blur(24px) saturate(145%)!important}
        .meeting-room-stage{padding:clamp(14px,2vw,24px)!important}.meeting-room-stage-top{padding:4px 4px 18px!important}.meeting-live-dot{background:#ec4899!important;box-shadow:0 0 0 5px rgba(236,72,153,.12)!important}
        .meeting-video-grid{grid-template-columns:repeat(3,minmax(0,1fr))!important;align-items:stretch!important;gap:12px!important;max-width:none!important;padding:4px 0 10px!important}
        .meeting-video-area{border-radius:18px!important;box-shadow:0 10px 28px rgba(35,31,55,.14)!important;outline:1px solid rgba(255,255,255,.55)!important;background:#25263b!important}
        /* Participant tiles are equal-sized by default. Only screen sharing expands. */
        .meeting-video-grid--solo{display:flex!important;justify-content:center!important;align-items:center!important;min-height:0!important}
        .meeting-video-grid--solo .meeting-video-area--local:not([data-recording-featured="true"]){width:180px!important;max-width:180px!important;height:300px!important;max-height:300px!important;aspect-ratio:3/5!important;flex:0 0 180px!important;grid-column:auto!important}
        .meeting-video-grid--group{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(min(100%,220px),1fr))!important;align-items:start!important}
        .meeting-video-grid--group .meeting-video-area:not([data-recording-featured="true"]){width:100%!important;height:180px!important;max-height:180px!important;aspect-ratio:16/9!important;grid-column:auto!important}
        .meeting-video-grid .meeting-video-area[data-recording-featured="true"]{width:100%!important;grid-column:1/-1!important;height:min(65vh,650px)!important;max-height:650px!important;aspect-ratio:16/9!important}
        .meeting-video-placeholder{position:absolute!important;inset:0!important;width:100%!important;height:100%!important;min-width:0!important;min-height:0!important;box-sizing:border-box!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;gap:10px!important;padding:18px!important;text-align:center!important}
        .meeting-video-placeholder h2{margin:0!important;font-size:clamp(15px,2vw,22px)!important;line-height:1.2!important}
        .meeting-video-placeholder p{margin:0!important}
        .meeting-video-avatar{width:84px!important;height:84px!important;min-width:84px!important;min-height:84px!important;font-size:30px!important}
        .meeting-video-area video{width:100%;height:100%;object-fit:cover}
        .meeting-video-area video{border-radius:18px!important}.meeting-video-name{left:12px!important;right:12px!important;bottom:12px!important;border-radius:12px!important;padding:9px 12px!important;background:rgba(26,25,44,.62)!important;backdrop-filter:blur(16px)!important}
        .meeting-room-controls{margin:14px auto 0!important;padding:10px 13px!important;border:1px solid rgba(255,255,255,.92)!important;border-radius:20px!important;background:rgba(255,255,255,.82)!important;box-shadow:0 12px 30px rgba(88,65,120,.12)!important;backdrop-filter:blur(18px)!important}
        .meeting-control-button{border-radius:15px!important;background:#fff!important;border-color:#eee7f5!important;box-shadow:0 4px 12px rgba(73,54,97,.07)!important}.meeting-control-button:hover{border-color:#d8b4fe!important}
        .meeting-control-button.meeting-leave-button{border-color:#e94b79!important;background:linear-gradient(135deg,#f05283,#dc356b)!important;box-shadow:0 7px 16px rgba(225,55,111,.22)!important}
        .meeting-room-participants{padding:20px!important}.meeting-participants-heading{padding-bottom:16px!important}.meeting-participant-item{background:rgba(250,248,255,.88)!important;border:1px solid rgba(232,224,244,.9)!important;border-radius:14px!important}
        .meeting-participants-footer{background:linear-gradient(135deg,#f5edff,#fff0f4)!important;border:1px solid rgba(232,215,250,.8)!important}.meeting-room-participants>section{border-top-color:#eee5f5!important}
        .meeting-room-participants input{border-color:#e8e0ef!important;border-radius:13px!important;background:rgba(255,255,255,.92)!important}.meeting-room-participants input:focus{border-color:#c084fc!important;box-shadow:0 0 0 3px rgba(192,132,252,.14)!important}
        .meeting-room-participants form button{border-radius:13px!important;background:linear-gradient(135deg,#a855f7,#ec4899)!important;box-shadow:0 6px 14px rgba(168,85,247,.2)!important}
        .meeting-room-footer{background:rgba(255,255,255,.48)!important;border-top-color:rgba(255,255,255,.7)!important;backdrop-filter:blur(16px)!important}.meeting-room-footer button{border:0;background:transparent;color:#8b5cf6;font-weight:700;cursor:pointer}
        @media(max-width:980px){.meeting-room-main{grid-template-columns:1fr!important}.meeting-room-participants{width:auto!important}.meeting-video-grid .meeting-video-area[data-recording-featured="true"]{height:min(52vh,480px)!important}}
        @media(max-width:560px){.meeting-room-main{padding:12px!important;gap:13px!important}.meeting-room-stage,.meeting-room-participants{border-radius:19px!important}.meeting-video-grid--group{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}.meeting-video-grid--solo .meeting-video-area--local:not([data-recording-featured="true"]){width:160px!important;flex-basis:160px!important;height:270px!important;max-height:270px!important}.meeting-video-grid .meeting-video-area[data-recording-featured="true"]{height:min(42vh,340px)!important}.meeting-room-controls{width:100%;gap:7px!important}.meeting-control-button{min-width:55px!important}}

        /* Keep the meeting stage content-sized instead of stretching it to
           match the taller sidebar stack. This removes the large empty area
           beneath the participant controls. */
        .meeting-room-main {
          align-items: start !important;
        }
        .meeting-room-stage {
          align-self: start !important;
          height: fit-content !important;
          min-height: 0 !important;
          flex: 0 0 auto !important;
        }
        .meeting-room-stage .meeting-video-grid {
          flex: 0 0 auto !important;
          align-content: start !important;
          height: auto !important;
          min-height: 0 !important;
        }
        .meeting-room-stage .meeting-room-controls {
          flex: 0 0 auto !important;
        }
        @media (min-width: 981px) {
          .meeting-room-main {
            grid-template-columns: minmax(0, 1.75fr) minmax(310px, .85fr) !important;
          }
        }

            `}</style>
      <header className="meeting-room-header">
        <div className="meeting-room-brand">
          <div className="meeting-room-brand-icon">I</div>
          <span>IntellMeet</span>
        </div>

        <div className="meeting-room-header-info">
          <strong>{meeting.title}</strong>
          <span>{new Date(meeting.startTime).toLocaleString()}</span>
        </div>

        <button
          className="meeting-room-back"
          onClick={() => navigate(`/meetings/${meeting._id}`)}
        >
          Meeting details
        </button>
      </header>

      <main className="meeting-room-main">
        <section className="meeting-room-stage">
          <div className="meeting-room-stage-top">
            <div>
              <span className="meeting-live-dot" />
              <span>Meeting room</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginLeft: "auto", flexWrap: "wrap" }}>
              <button
                type="button"
                className={`meeting-audio-status-button ${meetingAudioEnabled ? "is-enabled" : "is-disabled"}`}
                onClick={toggleMeetingAudio}
                title={meetingAudioEnabled ? "Mute audio from other meeting participants" : "Enable sound from other meeting participants"}
                aria-label={meetingAudioEnabled ? "Mute meeting audio" : "Enable meeting audio"}
                aria-pressed={meetingAudioEnabled}
              >
                <span className="meeting-audio-status-icon" aria-hidden="true">
                  {meetingAudioEnabled ? "◖))" : "◖×"}
                </span>
                <span>{meetingAudioEnabled ? "Sound on" : "Sound off"}</span>
                <span className="meeting-audio-status-indicator" aria-hidden="true" />
              </button>
              <span className="meeting-room-stage-label">
                {isRecording ? `● Recording · ${formatRecordingTime(recordingSeconds)}` : "IntellMeet Session"}
              </span>
              {isHost && (
                <button
                  type="button"
                  className={`meeting-record-button ${isRecording ? "is-recording" : ""}`}
                  onClick={isRecording ? stopMeetingRecording : startMeetingRecording}
                  title={isRecording ? "Stop meeting recording" : "Record entire meeting"}
                >
                  <span>{isRecording ? "■" : "●"}</span>
                  {isRecording ? `Stop · ${formatRecordingTime(recordingSeconds)}` : "Record meeting"}
                </button>
              )}
            </div>
          </div>

          {/* Compact Google Meet-style participant grid. Screen sharers take
              the prominent top position; otherwise the host is first. */}
          <div
            className={`meeting-video-grid ${remoteParticipants.length === 0 ? "meeting-video-grid--solo" : "meeting-video-grid--group"}`}
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              alignItems: "start",
              gap: "14px",
              width: "100%",
              maxWidth: "1100px",
              margin: "0 auto",
              padding: "12px 0",
            }}
          >
            {/* Local participant */}
            <div
              className="meeting-video-area meeting-video-area--local"
              data-recording-featured={isScreenSharing ? "true" : "false"}
              style={{
                order: localTileOrder,
                width: remoteParticipants.length === 0 && !isScreenSharing ? "180px" : "100%",
                minWidth: 0,
                aspectRatio: isScreenSharing ? "16 / 9" : remoteParticipants.length === 0 ? "3 / 5" : "16 / 9",
                height: isScreenSharing ? "min(58vh, 560px)" : remoteParticipants.length === 0 ? "300px" : "180px",
                maxHeight: isScreenSharing ? "560px" : remoteParticipants.length === 0 ? "300px" : "180px",
                gridColumn: isScreenSharing ? "1 / -1" : "auto",
                overflow: "hidden",
                position: "relative",
              }}
            >
              <video
                ref={videoRef}
                className="meeting-local-video"
                autoPlay
                playsInline
                muted
                style={{
                  display:
                    (cameraOn || isScreenSharing) && !mediaLoading
                      ? "block"
                      : "none",
                  width: "100%",
                  height: "100%",
                  transform: isScreenSharing ? "none" : "scaleX(-1)",
                  objectFit: isScreenSharing ? "contain" : "cover",
                }}
              />

              {!cameraOn && !isScreenSharing && !mediaLoading && (
                <div className="meeting-video-placeholder">
                  <div className="meeting-video-avatar">
                    {user?.name?.charAt(0).toUpperCase() || "U"}
                  </div>
                  <h2>{user?.name || "You"}</h2>
                  <p>Camera is off</p>
                  <span className="meeting-camera-off-label">Camera off</span>
                </div>
              )}

              {mediaLoading && (
                <div className="meeting-video-placeholder">
                  <p>Connecting to camera...</p>
                </div>
              )}

              <div className="meeting-video-name">
                <span>{user?.name || "You"}{isHost ? " · Host" : ""}</span>
                <span>{micOn ? "🎙" : "🔇"}</span>
              </div>
            </div>

            {/* Remote participants: screen sharer first, then host, then others. */}
            {orderedRemoteParticipants.map((participant) => {
              const isParticipantHost =
                String(participantsRef.current.get(participant.socketId)?.userId) ===
                String(meeting?.createdBy?._id);

              return (
                <div
                  className="meeting-video-area"
                  key={participant.socketId}
                  data-recording-featured={participant.isScreenSharing ? "true" : "false"}
                  style={{
                    order: participant.isScreenSharing ? 0 : isParticipantHost ? 1 : 2,
                    width: "100%",
                    minWidth: 0,
                    aspectRatio: "16 / 9",
                    height: participant.isScreenSharing ? "min(58vh, 560px)" : "auto",
                    maxHeight: participant.isScreenSharing ? "560px" : "250px",
                    gridColumn: participant.isScreenSharing ? "1 / -1" : "auto",
                    overflow: "hidden",
                    position: "relative",
                  }}
                >
                  {participant.cameraOn || participant.isScreenSharing ? (
                    <video
                      className="meeting-local-video"
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: "100%",
                        height: "100%",
                        transform: "none",
                        WebkitTransform: "none",
                        objectFit: participant.isScreenSharing ? "contain" : "cover",
                      }}
                      ref={(element) => {
                        if (element && element.srcObject !== participant.stream) {
                          element.srcObject = participant.stream;
                          void element.play().catch((error) => {
                            console.warn("Remote video autoplay was blocked:", error);
                          });
                        }
                      }}
                    />
                  ) : (
                    <div className="meeting-video-placeholder">
                      <div className="meeting-video-avatar">
                        {participant.userName.charAt(0).toUpperCase() || "U"}
                      </div>
                      <h2>{participant.userName}</h2>
                      <p>Camera is off</p>
                      <span className="meeting-camera-off-label">Camera off</span>
                    </div>
                  )}

                  <div className="meeting-video-name">
                    <span>
                      {participant.userName}
                      {isParticipantHost ? " · Host" : ""}
                      {participant.isScreenSharing ? " · Presenting" : ""}
                    </span>
                    <span>{participant.micOn === false ? "🔇" : "🎙"}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {mediaError && (
            <div className="meeting-media-error">
              {mediaError}
            </div>
          )}

          {recordingError && (
            <div className="meeting-media-error" role="alert">{recordingError}</div>
          )}

          {/* Meeting controls */}
          <div className="meeting-room-controls">
            <div className="meeting-mic-control-wrap">
              <button
                type="button"
                className={`meeting-control-button ${
                  !micOn ? "control-off" : ""
                }`}
                onClick={toggleMicrophone}
                title={micOn ? "Mute microphone" : "Unmute microphone"}
              >
                <span>{micOn ? "🎙" : "🔇"}</span>
                <small>{micOn ? "Mute" : "Unmute"}</small>
              </button>
              <div
                className={`meeting-audio-meter ${!micOn ? "is-muted" : ""}`}
                role="meter"
                aria-label={micOn ? `Microphone input level ${audioLevel}%` : "Microphone muted"}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={micOn ? audioLevel : 0}
                title={micOn ? "Live microphone input level" : "Microphone muted"}
              >
                {Array.from({ length: 9 }, (_, index) => {
                  const threshold = (index + 1) * 11;
                  const active = micOn && audioLevel >= threshold;
                  const heights = [4, 6, 9, 11, 8, 12, 9, 6, 4];
                  return (
                    <span
                      key={index}
                      style={{
                        height: `${active ? heights[index] : 3}px`,
                        opacity: active ? 1 : 0.35,
                      }}
                    />
                  );
                })}
              </div>
              <span className="meeting-audio-meter-label">
                {audioMeterStatus}
              </span>
            </div>

            <button
              className={`meeting-control-button ${
                !cameraOn ? "control-off" : ""
              }`}
              onClick={toggleCamera}
              title={cameraOn ? "Turn camera off" : "Turn camera on"}
            >
              <span>{cameraOn ? "▣" : "▧"}</span>
              <small>{cameraOn ? "Camera" : "Camera off"}</small>
            </button>

            <button
              className={`meeting-control-button ${
                isScreenSharing ? "control-off" : ""
              }`}
              onClick={toggleScreenSharing}
              title={
                isScreenSharing ? "Stop sharing" : "Share screen"
              }
            >
              <span>▣</span>
              <small>
                {isScreenSharing ? "Stop sharing" : "Share screen"}
              </small>
            </button>

            <button
              className="meeting-control-button meeting-leave-button"
              onClick={leaveMeeting}
              title="Leave meeting"
            >
              <span>↗</span>
              <small>Leave</small>
            </button>
          </div>
        </section>

        <div className="meeting-room-sidebar-stack">
          <nav className="meeting-sidebar-tabs" aria-label="Meeting sidebar sections">
            <button type="button" className={`meeting-sidebar-tab ${activeSidebarTab === "participants" ? "is-active" : ""}`} aria-selected={activeSidebarTab === "participants"} onClick={() => setActiveSidebarTab("participants")}>👥 Participants <span>({participants.length + 1})</span></button>
            <button type="button" className={`meeting-sidebar-tab ${activeSidebarTab === "chat" ? "is-active" : ""}`} aria-selected={activeSidebarTab === "chat"} onClick={() => setActiveSidebarTab("chat")}>✉ Chat</button>
            <button type="button" className={`meeting-sidebar-tab ${activeSidebarTab === "transcript" ? "is-active" : ""}`} aria-selected={activeSidebarTab === "transcript"} onClick={() => setActiveSidebarTab("transcript")}>▤ Transcript</button>
            <button type="button" className={`meeting-sidebar-tab ${activeSidebarTab === "summary" ? "is-active" : ""}`} aria-selected={activeSidebarTab === "summary"} onClick={() => setActiveSidebarTab("summary")}>✦ AI Summary</button>
          </nav>
        <aside className={`meeting-room-participants meeting-sidebar-tab-panel ${activeSidebarTab === "participants" ? "is-active" : ""}`}>
          <div className="meeting-participants-heading">
            <div>
              <h3>Participants</h3>
              <p>People in this meeting</p>
            </div>

            <span className="meeting-participant-count">
              {participants.length + 1}
            </span>
          </div>

          <div className="meeting-participant-list">
            {/* Current user */}
            <div className="meeting-participant-item">
              <div className="meeting-participant-avatar">
                {user?.name?.charAt(0).toUpperCase() || "U"}
              </div>

              <div className="meeting-participant-info">
                <strong>{user?.name || "You"} (You)</strong>
                <span>{isHost ? "Meeting host" : "Participant"}</span>
              </div>

              <span className="meeting-participant-mic">
                {micOn ? "🎙" : "🔇"}
              </span>
            </div>

            {/* Other participants */}
            {participants.map((participant) => (
              <div
                className="meeting-participant-item"
                key={participant.socketId}
              >
                <div className="meeting-participant-avatar">
                  {participant.userName.charAt(0).toUpperCase() || "U"}
                </div>

                <div className="meeting-participant-info">
                  <strong>{participant.userName}</strong>
                 <span>
                  {String(participant.userId) === String(meeting.createdBy?._id)
                    ? "Meeting host"
                    : "Participant"}
                </span>
                </div>

                <span className="meeting-participant-mic">
                  {participant.micOn === false ? "🔇" : "🎙"}
                </span>
              </div>
            ))}
          </div>

          <div className="meeting-participants-footer">
            <span className="meeting-participants-footer-icon">✦</span>

            <p>
              Your meeting space is ready. Invite others to join your
              conversation.
            </p>
          </div>
        </aside>

        {/* Chat is a separate card, not part of the participant list. */}
        <aside className={`meeting-side-card meeting-chat-card meeting-sidebar-tab-panel ${activeSidebarTab === "chat" ? "is-active" : ""}`}>
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              width: "100%",
              minWidth: 0,
              marginTop: "22px",
              paddingTop: "18px",
              borderTop: "1px solid #e5e7eb",
              gap: "12px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color: "#1f2937",
                    fontSize: "19px",
                  }}
                >
                  Meeting Chat
                </h3>

                <p
                  style={{
                    margin: "4px 0 0",
                    color: "#8b93a1",
                    fontSize: "12px",
                  }}
                >
                  Chat with meeting participants
                </p>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "6px 10px",
                  borderRadius: "20px",
                  background: "#eafaf2",
                  color: "#16a36a",
                  fontSize: "11px",
                  fontWeight: 600,
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    background: "#16a36a",
                  }}
                />
                Live
              </span>
            </div>

            {/* Chat messages */}
            <div
              ref={chatMessagesRef}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "16px",
                height: "300px",
                minHeight: "220px",
                overflowY: "auto",
                padding: "16px 12px",
                background: "#f8fafc",
                border: "1px solid #edf0f4",
                borderRadius: "12px",
                scrollBehavior: "smooth",
              }}
            >
              {messages.length === 0 ? (
                <div
                  style={{
                    display: "flex",
                    flex: 1,
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    textAlign: "center",
                    color: "#64748b",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "42px",
                      height: "42px",
                      marginBottom: "12px",
                      borderRadius: "50%",
                      background: "#eef2ff",
                      color: "#4f46e5",
                      fontSize: "20px",
                    }}
                  >
                    ✉
                  </div>

                  <strong
                    style={{
                      color: "#334155",
                      fontSize: "13px",
                    }}
                  >
                    No messages yet
                  </strong>

                  <p style={{ margin: "5px 0 0", fontSize: "11px" }}>
                    Start the conversation with your team.
                  </p>
                </div>
              ) : (
                messages.map((message) => {
                  const isOwnMessage =
                    message.senderUserId === user?.id;

                  return (
                    <div
                      key={message.id}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: isOwnMessage
                          ? "flex-end"
                          : "flex-start",
                        alignSelf: isOwnMessage
                          ? "flex-end"
                          : "flex-start",
                        maxWidth: "85%",
                        gap: "4px",
                      }}
                    >
                      {!isOwnMessage && (
                        <span
                          style={{
                            color: "#475569",
                            fontSize: "11px",
                            fontWeight: 700,
                            padding: "0 4px",
                          }}
                        >
                          {message.senderName}
                        </span>
                      )}

                      <div
                        style={{
                          padding: "10px 13px",
                          borderRadius: "13px",
                          borderBottomRightRadius: isOwnMessage
                            ? "4px"
                            : "13px",
                          borderBottomLeftRadius: isOwnMessage
                            ? "13px"
                            : "4px",
                          background: isOwnMessage
                            ? "#4f46e5"
                            : "#ffffff",
                          color: isOwnMessage
                            ? "#ffffff"
                            : "#263244",
                          border: isOwnMessage
                            ? "none"
                            : "1px solid #e8edf3",
                          fontSize: "13px",
                          lineHeight: 1.5,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {message.message}
                      </div>

                      <span
                        style={{
                          color: "#9ca3af",
                          fontSize: "10px",
                          padding: "0 3px",
                        }}
                      >
                        {new Date(message.createdAt).toLocaleTimeString(
                          [],
                          {
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Typing indicator */}
            <div
              style={{
                minHeight: "16px",
                paddingLeft: "4px",
                color: "#64748b",
                fontSize: "11px",
              }}
            >
              {typingUsers.length > 0
                ? `${typingUsers
                    .map((item) => item.userName)
                    .join(", ")} typing...`
                : ""}
            </div>

            {/* Message input */}
            <form
              onSubmit={sendMessage}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "9px",
              }}
            >
              <input
                type="text"
                value={messageInput}
                onChange={(event) =>
                  handleMessageChange(event.target.value)
                }
                placeholder="Write a message..."
                maxLength={2000}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: "44px",
                  padding: "0 13px",
                  border: "1px solid #dfe4eb",
                  borderRadius: "10px",
                  outline: "none",
                  background: "#ffffff",
                  color: "#1f2937",
                  fontSize: "13px",
                }}
              />

              <button
                type="submit"
                disabled={!messageInput.trim()}
                title="Send message"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "44px",
                  height: "44px",
                  flexShrink: 0,
                  border: "none",
                  borderRadius: "10px",
                  background: messageInput.trim()
                    ? "#4f46e5"
                    : "#cbd5e1",
                  color: "#ffffff",
                  fontSize: "20px",
                  cursor: messageInput.trim()
                    ? "pointer"
                    : "not-allowed",
                }}
              >
                ➤
              </button>
            </form>
          </section>
        </aside>

        {/* AI transcript is kept in its own independent card. */}
        <aside className={`meeting-side-card meeting-transcript-card meeting-sidebar-tab-panel ${activeSidebarTab === "transcript" ? "is-active" : ""}`}>
          <section
            aria-live="polite"
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "14px",
              marginTop: "20px",
              paddingTop: "20px",
              borderTop: "1px solid #e5eaf1",
              minWidth: 0,
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                flexWrap: "wrap",
                columnGap: "12px",
                rowGap: "9px",
                minWidth: 0,
              }}
            >
              <div style={{ flex: "1 1 190px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "5px" }}>
                  <span
                    aria-hidden="true"
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      width: "28px",
                      height: "28px",
                      flex: "0 0 28px",
                      borderRadius: "9px",
                      background: "#eef2ff",
                      color: "#4f46e5",
                      fontSize: "15px",
                    }}
                  >
                    ✦
                  </span>
                  <h3 style={{ margin: 0, color: "#172033", fontSize: "17px", lineHeight: 1.25, fontWeight: 750 }}>
                    AI Meeting Transcript
                  </h3>
                </div>
                <p style={{ margin: 0, color: "#7b8798", fontSize: "12px", lineHeight: 1.5 }}>
                  Your meeting transcript will appear here after recording.
                </p>
              </div>

              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  alignSelf: "flex-start",
                  flex: "0 0 auto",
                  maxWidth: "100%",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background:
                    transcriptionStatus === "completed" ? "#ecfdf3" :
                    transcriptionStatus === "failed" ? "#fff1f2" :
                    transcriptionStatus === "uploading" ? "#eef2ff" : "#f1f5f9",
                  color:
                    transcriptionStatus === "completed" ? "#15803d" :
                    transcriptionStatus === "failed" ? "#be123c" :
                    transcriptionStatus === "uploading" ? "#4f46e5" : "#64748b",
                  fontSize: "11px",
                  fontWeight: 700,
                  lineHeight: 1.2,
                  whiteSpace: "nowrap",
                }}
              >
                {transcriptionStatus === "uploading" ? "Transcribing…" : transcriptionStatus === "completed" ? "Completed" : transcriptionStatus === "failed" ? "Failed" : "Waiting for recording"}
              </span>
            </div>

            {transcriptionStatus === "uploading" && (
              <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "13px 14px", borderRadius: "12px", background: "#f5f7ff", border: "1px solid #e0e7ff", color: "#4338ca", fontSize: "12px", lineHeight: 1.5 }}>
                <span aria-hidden="true" style={{ fontSize: "16px" }}>◌</span>
                <span>Uploading and transcribing your meeting audio. This may take a little while.</span>
              </div>
            )}

            {transcriptionError && (
              <p role="alert" style={{ margin: 0, padding: "13px 14px", borderRadius: "12px", background: "#fff5f6", border: "1px solid #ffe0e5", color: "#be123c", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" }}>
                {transcriptionError}
              </p>
            )}

            {transcriptText ? (
              <div style={{ maxHeight: "360px", overflowY: "auto", whiteSpace: "pre-wrap", overflowWrap: "anywhere", padding: "15px", border: "1px solid #e5eaf1", borderRadius: "12px", background: "#fbfcfe", color: "#334155", fontSize: "13px", lineHeight: 1.7, boxSizing: "border-box" }}>
                {transcriptText}
              </div>
            ) : transcriptionStatus === "idle" ? (
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "12px",
                  padding: "16px",
                  border: "1px dashed #d5deeb",
                  borderRadius: "12px",
                  background: "#fafcff",
                  boxSizing: "border-box",
                  minWidth: 0,
                }}
              >
                <span aria-hidden="true" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "30px", height: "30px", flex: "0 0 30px", borderRadius: "9px", background: "#eef2ff", color: "#5965c8", fontSize: "15px" }}>
                  ▤
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, color: "#475569", fontSize: "12px", fontWeight: 650, lineHeight: 1.45 }}>
                    No transcript yet
                  </p>
                  <p style={{ margin: "3px 0 0", color: "#8793a5", fontSize: "12px", lineHeight: 1.5 }}>
                    Start and stop a meeting recording. Your transcript will be generated automatically and shown here.
                  </p>
                </div>
              </div>
            ) : null}
          </section>
        </aside>

        {/* AI meeting summary is an independent sidebar card. */}
        <aside className={`meeting-side-card meeting-summary-card meeting-sidebar-tab-panel ${activeSidebarTab === "summary" ? "is-active" : ""}`} style={{ minWidth: 0, padding: "18px", borderRadius: "18px", background: "rgba(255,255,255,.96)", border: "1px solid #ece8f5", boxShadow: "0 10px 28px rgba(38,24,68,.06)" }}>
          <section aria-live="polite" style={{ display: "flex", flexDirection: "column", gap: "15px", minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                  <span aria-hidden="true" style={{ display: "inline-flex", width: "30px", height: "30px", alignItems: "center", justifyContent: "center", borderRadius: "10px", background: "#f1eafe", color: "#7c3aed", fontSize: "17px" }}>✦</span>
                  <h3 style={{ margin: 0, color: "#172033", fontSize: "17px", fontWeight: 750 }}>AI Meeting Summary</h3>
                </div>
                <p style={{ margin: "6px 0 0", color: "#7b8798", fontSize: "12px", lineHeight: 1.5 }}>Overview, decisions and follow-up tasks generated from your transcript.</p>
              </div>
              {meetingSummary && <span style={{ flexShrink: 0, padding: "5px 9px", borderRadius: "999px", background: "#ecfdf3", color: "#15803d", fontSize: "10px", fontWeight: 700 }}>Ready</span>}
            </div>

            {isHost ? (
              <button type="button" onClick={generateMeetingSummary} disabled={summaryGenerating || summaryLoading} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", width: "100%", minHeight: "43px", border: 0, borderRadius: "11px", background: summaryGenerating ? "#a78bfa" : "linear-gradient(135deg,#7c3aed,#a855f7 55%,#ec4899)", color: "#fff", fontWeight: 700, fontSize: "13px", cursor: summaryGenerating || summaryLoading ? "wait" : "pointer", boxShadow: "0 7px 16px rgba(124,58,237,.18)" }}>
                {summaryGenerating ? "Generating summary…" : meetingSummary ? "↻ Regenerate Summary" : "✦ Generate Summary"}
              </button>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px", borderRadius: "10px", background: "#f5f3ff", color: "#6d28d9", fontSize: "11px", lineHeight: 1.5 }}>
                <span aria-hidden="true">🔒</span> The meeting host manages AI summaries. This section is read-only.
              </div>
            )}

            {(summaryGenerating || summaryLoading) && <div style={{ padding: "12px", borderRadius: "11px", background: "#f5f3ff", color: "#6d28d9", fontSize: "12px", lineHeight: 1.5 }}>{summaryGenerating ? "AI is analyzing the transcript and extracting decisions and action items. This can take a little while." : "Checking for a saved summary…"}</div>}
            {summaryError && <p role="alert" style={{ margin: 0, padding: "11px 12px", borderRadius: "10px", background: "#fff1f2", border: "1px solid #ffe0e5", color: "#be123c", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" }}>{summaryError}</p>}

            {meetingSummary ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px", minWidth: 0 }}>
                <div>
                  <h4 style={{ margin: "0 0 7px", color: "#303047", fontSize: "13px" }}>Meeting overview</h4>
                  <p style={{ margin: 0, color: "#536174", fontSize: "13px", lineHeight: 1.7, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{meetingSummary.summary}</p>
                </div>
                <div>
                  <h4 style={{ margin: "0 0 8px", color: "#303047", fontSize: "13px" }}>Key discussion points</h4>
                  {meetingSummary.keyPoints.length ? <ul style={{ margin: 0, paddingLeft: "19px", color: "#536174", fontSize: "12px", lineHeight: 1.7 }}>{meetingSummary.keyPoints.map((point, index) => <li key={`${index}-${point}`}>{point}</li>)}</ul> : <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>No key points extracted.</p>}
                </div>
                <div>
                  <h4 style={{ margin: "0 0 8px", color: "#303047", fontSize: "13px" }}>Decisions made</h4>
                  {meetingSummary.decisions.length ? <ul style={{ margin: 0, paddingLeft: "19px", color: "#536174", fontSize: "12px", lineHeight: 1.7 }}>{meetingSummary.decisions.map((decision, index) => <li key={`${index}-${decision}`}>{decision}</li>)}</ul> : <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>No decisions identified.</p>}
                </div>
                <div>
                  <h4 style={{ margin: "0 0 9px", color: "#303047", fontSize: "13px" }}>Action items <span style={{ color: "#8b5cf6" }}>({meetingSummary.actionItems.length})</span></h4>
                  {meetingSummary.actionItems.length ? <div style={{ display: "flex", flexDirection: "column", gap: "9px" }}>{meetingSummary.actionItems.map((item, index) => { const priority = ["high", "medium", "low"].includes(item.priority) ? item.priority : "medium"; const priorityColor = priority === "high" ? "#be123c" : priority === "medium" ? "#b45309" : "#15803d"; return <div key={`${index}-${item.task}`} style={{ padding: "12px", border: "1px solid #ece8f5", borderRadius: "11px", background: "#fcfbff" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "8px" }}><strong style={{ color: "#394357", fontSize: "12px", lineHeight: 1.5, overflowWrap: "anywhere" }}>{item.task}</strong><span style={{ flexShrink: 0, padding: "3px 7px", borderRadius: "999px", background: priority === "high" ? "#fff1f2" : priority === "medium" ? "#fffbeb" : "#ecfdf3", color: priorityColor, fontSize: "9px", fontWeight: 800, textTransform: "uppercase" }}>{priority}</span></div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 14px", marginTop: "7px", color: "#7b8798", fontSize: "11px" }}><span>Assignee: {item.assignee || "Unassigned"}</span><span>Due: {item.dueDate ? new Date(item.dueDate).toLocaleDateString() : "Not specified"}</span></div>
                  </div>; })}</div> : <p style={{ margin: 0, color: "#94a3b8", fontSize: "12px" }}>No action items extracted.</p>}
                </div>
                {meetingSummary.createdAt && <p style={{ margin: 0, color: "#9aa3b2", fontSize: "10px" }}>Generated {new Date(meetingSummary.createdAt).toLocaleString()}</p>}
              </div>
            ) : !summaryGenerating && !summaryLoading && !summaryError ? (
              <div style={{ padding: "17px 14px", border: "1px dashed #d8d1e8", borderRadius: "12px", background: "#fbfaff", textAlign: "center" }}>
                <div aria-hidden="true" style={{ fontSize: "25px", color: "#8b5cf6", marginBottom: "7px" }}>✧</div>
                <strong style={{ display: "block", color: "#475569", fontSize: "12px" }}>No summary generated yet</strong>
                <p style={{ margin: "5px 0 0", color: "#8793a5", fontSize: "11px", lineHeight: 1.5 }}>{isHost ? "Generate an AI summary after a transcript has been saved for this meeting." : "The summary will appear here when the host generates it."}</p>
              </div>
            ) : null}
          </section>
        </aside>
        </div>
      </main>

      <footer className="meeting-room-footer">
        <span>IntellMeet</span>
        <span>{meeting.title}</span>

        <button onClick={handleLogout}>Log out</button>
      </footer>
    </div>
  );
};

export default MeetingRoom;
