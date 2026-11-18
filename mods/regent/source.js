import { agents, panes, spaces, shared } from "herdr";

export const liveAgents = () => agents();
export const liveSpaces = () => spaces();
export const livePanes = () => panes();
export const liveData = () => shared("regent.data");
