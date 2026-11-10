export type Intent={request:string;attendees:number;tents:number;budgetMinor:number;eventAt:string;timezone:string;venue:string;weather:string;tentMode:'RENT'|'BUY'};
export type Offer={id:string;merchantId:string;merchantName:string;category:'TENTS'|'CATERING';title:string;description:string;unitMinor:number;capacity:number;badge:string};
export type Line={id:string;offerId:string;merchantId:string;merchantName:string;category:'TENTS'|'CATERING';title:string;quantity:number;unitMinor:number;totalMinor:number;paymentIntent:'CAPTURE'|'AUTHORIZE';source:ProductSource|null};
/** Purchase-listing provenance. The demo pays the configured sandbox merchant; it places no retailer order. */
export type ProductSource={provider:string;productId:string;brand:string|null;store:string;productUrl:string|null;rating?:number|null;ratingCount?:number|null;offersCompared?:number|null};
export type Assessment={role:string;summary:string;facts:string[];source:string};
export type Plan={id:string;version:number;intent:Intent;lines:Line[];assessments:Assessment[];totalMinor:number;expiresAt:string;status:string;createdAt:string};
export type Order={id:string;merchantId:string;merchantName:string;title:string;category:'TENTS'|'CATERING';quantity:number;amountMinor:number;paymentIntent:string;status:string;providerOrderId:string|null;authorizationId:string|null;captureId:string|null};
export type AuditEvent={sequence:number;type:string;message:string;source:string;at:string;previousHash:string;hash:string};
export type Workflow={plan:Plan;orders:Order[];events:AuditEvent[];committedMinor:number;capturedMinor:number;mode:'demo'|'sandbox';receiptVerified:boolean;paymentFrozen:boolean;agentRequests:AgentRequest[]};
export type ProviderResult={status:string;providerOrderId:string;authorizationId:string|null;captureId:string|null;source:string};
export type GateResult={state:string;execution:string;decisionId:string|null;dossierId:string|null;intentHash:string|null;intentId:string|null;message:string;result:ProviderResult|null};
export type Command={command:{id:string;orderId:string;operation:string;merchantId:string;amountMinor:number};state:string;result:GateResult|null};
/** An agent's payment request the authority decided; never queued as a payment. */
export type AgentRequest={command:{id:string;operation:string;merchantId:string;amountMinor:number};result:GateResult;at:string};
export type Config={mode:'demo'|'sandbox';demoSessionEnabled:boolean;paypalSignIn:boolean;tentPurchases:boolean;aiProvider:'demo'|'azure'|'openai';model:string;authority:string;catalogSource:string;receiptIssuer:string;clientIds:Record<string,string>;policyVersion:string;dashboardAgent:boolean;agStudioLicenseKey:string};
export type Session={authenticated:boolean;username:string;name:string;csrfToken:string;csrfHeader:string};
/** A payment command or an agent request the authority decided, across the organizer's plans. */
export type LedgerEntry={id:string;at:string;settledAt:string;workflowId:string;venue:string;eventAt:string;merchantName:string;category:'TENTS'|'CATERING';
  operation:string;requestedBy:'ORGANIZER'|'AGENT'|'SWARMPAY';amountMinor:number;state:string;execution:string|null;message:string|null;
  dossierId:string|null;providerOrderId:string|null;authorizationId:string|null;captureId:string|null;refundId:string|null};
