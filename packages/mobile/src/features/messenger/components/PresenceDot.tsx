import { View } from "react-native";
import { PRESENCE_COLORS, type PresenceStatus } from "../../../lib/presence";

interface Props {
  status: PresenceStatus;
  size?: number;
  borderColor?: string;
}

/**
 * Mała kropka statusu w rogu avatara. Offline → ukryta (mniej szumu w UI).
 */
export const PresenceDot = ({ status, size = 10, borderColor = "#ffffff" }: Props) => {
  if (status === "offline") return null;
  return (
    <View
      style={{
        position: "absolute",
        right: -1,
        bottom: -1,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: PRESENCE_COLORS[status],
        borderWidth: 2,
        borderColor,
      }}
    />
  );
};
