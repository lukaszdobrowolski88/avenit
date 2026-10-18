import { CampaignEditorScreen } from '../../../../src/features/campaigns/screens/CampaignEditorScreen';

// Nowa kampania albo edycja (?id=…) szkicu / zaplanowanej.
export default function SmsCampaignEditor() {
  return <CampaignEditorScreen kind="sms" />;
}
