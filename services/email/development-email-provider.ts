import type{EmailMessage,EmailProvider}from"./types";
import{randomUUID}from"crypto";
export class DevelopmentEmailProvider implements EmailProvider{readonly key="development";private outbox:EmailMessage[]=[];async send(message:EmailMessage){this.outbox.push({...message});return{messageId:`dev_${randomUUID()}`}}getOutbox(){return this.outbox.map(item=>({...item}))}clear(){this.outbox=[]}}
export class DisabledEmailProvider implements EmailProvider{readonly key="disabled";async send(_message:EmailMessage):Promise<{messageId:string}>{throw new Error("email_provider_unavailable")}}
