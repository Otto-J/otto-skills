# DNSPod API Notes

Official source pages used when creating this skill:

- Node.js SDK center: https://cloud.tencent.com/document/sdk/Node.js
- DNSPod API overview: https://cloud.tencent.com/document/product/1427/56194
- DescribeRecordList: https://cloud.tencent.com/document/product/1427/56166
- CreateRecord: https://cloud.tencent.com/document/product/1427/56180
- ModifyRecord: https://cloud.tencent.com/document/product/1427/56157

Core API facts:

- Service host: `dnspod.tencentcloudapi.com`
- API version: `2021-03-23`
- Region: omitted for DNSPod APIs
- Credential names used by this skill: `DNSPOD_ID` maps to Tencent Cloud SecretID, `DNSPOD_KEY` maps to SecretKey

Useful actions:

- `DescribeDomainList`: list domains and domain ids.
- `DescribeRecordList`: list records for one domain. Supports `Domain`, `DomainId`, `Subdomain`, `RecordType`, `RecordLine`, `RecordLineId`, `Keyword`, `Offset`, `Limit`, and `ErrorOnEmpty`.
- `CreateRecord`: create one record. Required: `Domain`, `RecordType`, `RecordLine`, `Value`. Optional common fields: `SubDomain`, `RecordLineId`, `MX`, `TTL`, `Weight`, `Status`, `Remark`.
- `ModifyRecord`: update one record. Required: `Domain`, `RecordType`, `RecordLine`, `Value`, `RecordId`. Optional common fields: `SubDomain`, `RecordLineId`, `MX`, `TTL`, `Weight`, `Status`, `Remark`.

Parameter casing traps:

- `DescribeRecordList` uses `Subdomain`.
- `CreateRecord` and `ModifyRecord` use `SubDomain`.
- Returned list items use `Name`, `Type`, `Line`, `LineId`, `Value`, `RecordId`, `TTL`, `MX`, and `Status`.

Operational notes:

- `DescribeRecordList` can return two default NS records that the console hides.
- `DescribeRecordList` has a documented default limit of 100 and maximum limit of 3000.
- New records can have a short index delay. Tencent Cloud documentation recommends retrying after 30 seconds when a newly added record is missing.
