import { agents, spaces, shared } from "herdr";

export const liveAgents = () => agents();
export const liveSpaces = () => spaces();
export const liveData = () => shared("regent.data");
