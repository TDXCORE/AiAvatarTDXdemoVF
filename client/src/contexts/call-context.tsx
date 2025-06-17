
import { createContext, useContext, useReducer, ReactNode } from 'react';

export interface CallState {
  isCallActive: boolean;
  isMuted: boolean;
  phase: 'idle' | 'speaking' | 'listening';
  avatarConnected: boolean;
}

type CallAction = 
  | { type: 'SET_CALL_ACTIVE'; active: boolean }
  | { type: 'SET_MUTED'; muted: boolean }
  | { type: 'SET_PHASE'; phase: CallState['phase'] }
  | { type: 'SET_AVATAR_CONNECTED'; connected: boolean }
  | { type: 'SOFT_RESET' }
  | { type: 'RESET' };

const defaultState: CallState = {
  isCallActive: false,
  isMuted: false,
  phase: 'idle',
  avatarConnected: false,
};

const callReducer = (state: CallState, action: CallAction): CallState => {
  switch (action.type) {
    case 'SET_CALL_ACTIVE':
      return { ...state, isCallActive: action.active };
    case 'SET_MUTED':
      return { ...state, isMuted: action.muted };
    case 'SET_PHASE':
      return { ...state, phase: action.phase };
    case 'SET_AVATAR_CONNECTED':
      return { ...state, avatarConnected: action.connected };
    case 'SOFT_RESET':
      return { 
        ...state, 
        phase: 'idle'
        // Mantener isCallActive y avatarConnected
      };
    case 'RESET':
      return defaultState;
    default:
      return state;
  }
};

const CallContext = createContext<{
  state: CallState;
  dispatch: React.Dispatch<CallAction>;
} | null>(null);

export const CallProvider = ({ children }: { children: ReactNode }) => {
  const [state, dispatch] = useReducer(callReducer, defaultState);
  
  return (
    <CallContext.Provider value={{ state, dispatch }}>
      {children}
    </CallContext.Provider>
  );
};

export const useCallState = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCallState must be used within CallProvider');
  }
  return context;
};
