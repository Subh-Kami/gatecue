// Checks that this machine's AWS login works for every service GateCue uses.
// Uses the default credential chain (so `aws login` works), prints status only, never credentials.
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { DynamoDBClient, DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { SESv2Client, GetAccountCommand } from "@aws-sdk/client-sesv2";
import { GeoRoutesClient, CalculateRoutesCommand } from "@aws-sdk/client-geo-routes";
import { BedrockRuntimeClient, ConverseCommand } from "@aws-sdk/client-bedrock-runtime";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";

const region = process.env.AWS_REGION ?? "us-east-1";
const table = process.env.GC_TABLE ?? "gatecue-memory";
const model = process.env.GC_BEDROCK_MODEL ?? "us.amazon.nova-2-lite-v1:0";

async function check(name, fn) {
  try { console.log(`✓ ${name}: ${await fn()}`); }
  catch (e) { console.log(`✗ ${name}: ${e.name ?? "Error"}: ${e.message}`); }
}

console.log(`Region ${region}\n`);
await check("Identity (STS)", async () => {
  const r = await new STSClient({ region }).send(new GetCallerIdentityCommand({}));
  return `account ${r.Account}${r.Arn?.endsWith(":root") ? " (root user)" : ""}`;
});
await check(`DynamoDB table ${table}`, async () => {
  const r = await new DynamoDBClient({ region }).send(new DescribeTableCommand({ TableName: table }));
  return `${r.Table?.TableStatus}, ${r.Table?.ItemCount ?? 0} items`;
});
await check("SES", async () => {
  const r = await new SESv2Client({ region }).send(new GetAccountCommand({}));
  return `${r.ProductionAccessEnabled ? "production" : "sandbox"}, ${r.SendQuota?.Max24HourSend ?? "?"}/day, sending ${r.SendingEnabled ? "on" : "off"}`;
});
await check("Location drive time", async () => {
  const r = await new GeoRoutesClient({ region }).send(new CalculateRoutesCommand({
    Origin: [-122.3321, 47.6062], Destination: [-122.3088, 47.4502], // downtown Seattle -> SEA
    TravelMode: "Car", DepartNow: true, LegAdditionalFeatures: ["Summary"],
  }));
  const route = r.Routes?.[0];
  const secs = route?.Summary?.Duration ?? route?.Legs?.reduce((s, l) => s + (l.VehicleLegDetails?.Summary?.Overview?.Duration ?? 0), 0);
  return `downtown Seattle to SEA ≈ ${Math.round((secs ?? 0) / 60)} min by car`;
});
await check("Polly voice", async () => {
  const r = await new PollyClient({ region }).send(new SynthesizeSpeechCommand({ Text: "GateCue test", OutputFormat: "mp3", Engine: "generative", VoiceId: "Ruth" }));
  return `${(await r.AudioStream.transformToByteArray()).length} bytes of speech (Ruth, generative)`;
});
await check(`Bedrock ${model}`, async () => {
  const r = await new BedrockRuntimeClient({ region }).send(new ConverseCommand({
    modelId: model,
    messages: [{ role: "user", content: [{ text: "Reply with exactly: GateCue test OK" }] }],
    inferenceConfig: { maxTokens: 20 },
  }));
  return r.output?.message?.content?.[0]?.text?.trim() ?? "no text";
});
