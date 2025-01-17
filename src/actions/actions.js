// ACTIONS JS --> update RDS sdk, it's currently crashing on select/click
import axios from 'axios';
import * as actionTypes from '../constants/actionTypes';
import compileGraphData from '../assets/compileGraphData'

const AWS = require('aws-sdk');

const params = {};

export const logIn = () => ({
  type: actionTypes.LOG_IN,
});

export const logOut = () => ({
  type: actionTypes.LOG_OUT,
});

export const getAWSKeys = (keys) => ({
  type: actionTypes.GET_AWS_KEYS,
  payload: keys
});

export const getAWSInstancesStart = () => ({
  type: actionTypes.GET_AWS_INSTANCES_START,
});

export const getAWSInstancesFinished = resp => ({
  type: actionTypes.GET_AWS_INSTANCES_FINISHED,
  payload: resp,
});

export const getAWSInstancesError = err => ({
  type: actionTypes.GET_AWS_INSTANCES_ERROR,
  payload: err,
});
// each service can have more than one security group. We find each security group and 
// which other SG they are connected to through in-bound and out-bound

export const getAWSInstances = (region, key1, key2) => {
  // sdk config to send in the region
  AWS.config.update({
    region,  // since we figure out we get info for this region
  });
  // to allow api calls you create a new instance of ec2 and rds --> allows method
  // like a mongoose model
  const ec2 = new AWS.EC2({});  // create object of whatever instance works
  const rds = new AWS.RDS({});
  // const s3 = new AWS.S3({});
  return (dispatch) => {
    dispatch(getAWSInstancesStart());
    /** HOW WE WANT THE DATA TO IDEALLY BE FORMATTED:
     * Data = {
    regionId: {
        VpcId: {
            AvailabilityZone: {
                EC2: {
                    id: {data}
                },
                RDS: {
                    id: {data}
                },
                S3: {
                    id: {data}
                },
                edges: {
                    inboundId: [outboundIds]
                }
            }
        }
    }
    */
    const regionState = {};
    const sgRelationships = []; // array of arrays where each inside looks like [ [inbound sg, outbound sg] ]
    const sgNodeCorrelations = {};
    const apiPromiseArray = [];
    // Adding S3 Query
    // adding new promise to promise array
   
    apiPromiseArray.push(new Promise(((resolve, reject) => {
      const innerPromiseArray = [];
      // make an api call to get information about RDS'
      // params is empty, to gell all rds in that region!
      rds.describeDBInstances(params, (err, data) => {
        if (err) {
          reject();
        } // an error occurred
        else {
          // loop through the data returned from api call
          // console log what comes in the data to see if there's anymore useful info
          // we can use later
          for (let i = 0; i < data.DBInstances.length; i += 1) {
            const DBinstances = data.DBInstances[i];
            // destructure the data for relevant data
            const {
              DBSubnetGroup: { VpcId }, AvailabilityZone, DbiResourceId, VpcSecurityGroups,
            } = DBinstances;            // if the property doesn't exist within the object, create an object to save all the data in
            if (!regionState.hasOwnProperty(VpcId)) regionState[VpcId] = {};
            if (!regionState[VpcId].hasOwnProperty(AvailabilityZone)) regionState[VpcId][AvailabilityZone] = {};
            if (!regionState[VpcId][AvailabilityZone].hasOwnProperty('RDS')) regionState[VpcId][AvailabilityZone].RDS = {};
            // save the data into the regionState object
            regionState[VpcId][AvailabilityZone].RDS[DbiResourceId] = DBinstances;
            innerPromiseArray.push(new Promise(((resolve, reject) => {
              const param = {
                GroupIds: [],
              };
              for (let k = 0; k < VpcSecurityGroups.length; k += 1) {
                param.GroupIds.push(VpcSecurityGroups[k].VpcSecurityGroupId);
              }
              // send in params for ec2 method to choose specific ec2 linked to the RDS's we found
              ec2.describeSecurityGroups(param, (err, data) => {
                if (err) {
                  console.log(err, err.stack);
                  reject();
                } else {
                  regionState[VpcId][AvailabilityZone].RDS[DbiResourceId].MySecurityGroups = data.SecurityGroups;
                  for (let h = 0; h < data.SecurityGroups.length; h++) {
                    if (!sgNodeCorrelations[data.SecurityGroups[h].GroupId]) sgNodeCorrelations[data.SecurityGroups[h].GroupId] = new Set();
                    sgNodeCorrelations[data.SecurityGroups[h].GroupId].add(DbiResourceId);
                    if (data.SecurityGroups[h].IpPermissions.length > 0) {
                      for (let i = 0; i < data.SecurityGroups[h].IpPermissions[0].UserIdGroupPairs.length; i++) {
                        sgRelationships.push([data.SecurityGroups[h].IpPermissions[0].UserIdGroupPairs[i].GroupId, data.SecurityGroups[h].GroupId]);
                      }
                    }
                  }
                  // const edgeTable = createEdges();
                  // resolve(edgeTable);
                  resolve();
                }
              });
            })));
          }
          Promise.all(innerPromiseArray).then(() => {
            resolve();
          });
        }
      });
    })));
    // get ec2 instances from API
    apiPromiseArray.push(new Promise(((resolve, reject) => {

      const innerPromiseArray = [];
      ec2.describeInstances(params, (err, data) => {
        if (err) {
          console.log('Error', err.stack);
          reject();
        } else {
          // data is formatted differently from RDS, needs an extra layer of iteration
          
          for (let i = 0; i < data.Reservations.length; i++) {
            const instances = data.Reservations[i].Instances;
            for (let j = 0; j < instances.length; j++) {
              if (instances[j].State.Name !== 'terminated'){
              const {
                VpcId, Placement: { AvailabilityZone }, InstanceId, SecurityGroups,
              } = instances[j];
              if (!regionState.hasOwnProperty(VpcId)) regionState[VpcId] = {};
              if (!regionState[VpcId].hasOwnProperty(AvailabilityZone)) regionState[VpcId][AvailabilityZone] = {};
              if (!regionState[VpcId][AvailabilityZone].hasOwnProperty('EC2')) regionState[VpcId][AvailabilityZone].EC2 = {};
              regionState[VpcId][AvailabilityZone].EC2[InstanceId] = instances[j];
              // making a new promise to query for information about security group related to each EC2
              innerPromiseArray.push(new Promise(((resolve, reject) => {
                const param = {
                  GroupIds: [],
                };
                for (let k = 0; k < SecurityGroups.length; k++) {
                  param.GroupIds.push(SecurityGroups[k].GroupId);
                }
                ec2.describeSecurityGroups(param, (err, data) => {
                  if (err) {
                    console.log(err, err.stack);
                    reject();
                  } else {
                    regionState[VpcId][AvailabilityZone].EC2[InstanceId].MySecurityGroups = data.SecurityGroups;
                    for (let h = 0; h < data.SecurityGroups.length; h++) {
                      if (!sgNodeCorrelations[data.SecurityGroups[h].GroupId]) sgNodeCorrelations[data.SecurityGroups[h].GroupId] = new Set();
                      sgNodeCorrelations[data.SecurityGroups[h].GroupId].add(InstanceId);
                      if (data.SecurityGroups[h].IpPermissions.length > 0) {
                        for (let i = 0; i < data.SecurityGroups[h].IpPermissions[0].UserIdGroupPairs.length; i++) {
                          sgRelationships.push([data.SecurityGroups[h].IpPermissions[0].UserIdGroupPairs[i].GroupId, data.SecurityGroups[h].GroupId]);
                        }
                      }
                    }
                    // const edgeTable = createEdges();
                    // resolve(edgeTable);
                    resolve();
                  }
                });
              })));
            }
            }
          }
          Promise.all(innerPromiseArray).then(() => {
            resolve();
          });
        }
      });
    })));

    // get S3 data
    apiPromiseArray.push(new Promise((mainResolve, mainReject) => {
      axios({
        method: 'post',
        url: 'https://graphql-compose.herokuapp.com/aws/',
        data: {
          query: `
          query {
            aws(config: {
              accessKeyId: "${key1}",
              secretAccessKey: "${key2}"
            }) {
              s3{  bucketlist_s3 : listBuckets{
                  ...GetBucketLocationData
              }
              }
            }
          }
  
          fragment GetBucketLocationData on AwsS3ListBucketsOutput{
            Buckets{
              Name
              CreationDate
            }
          }  
          `
        }
          }).then((listData) => {
            const buckArr = listData.data.data.aws.s3.bucketlist_s3.Buckets;
            const namesOfBuckets = []
  
            buckArr.forEach((bucketObj) => {
              namesOfBuckets.push(bucketObj['Name']);
            })
              const inPromiseArr = [];
            for (let i = 0; i < namesOfBuckets.length; i += 1) {
              inPromiseArr.push(new Promise((innerResolve, reject) => {
                // bucket region queries
                axios({
                  method: 'post',
                  url: 'https://graphql-compose.herokuapp.com/aws/',
                  data: {
                    query: `
                    query {
                      aws(config: {
                        accessKeyId: "${key1}",
                        secretAccessKey: "${key2}"
                      }) {
                      s3 {
                            get_region_s3 : getBucketLocation( input:{
                              Bucket: "${namesOfBuckets[i]}"
                            }
                            ) {
                              ...GetBucketLocationData
                            }
                            get_bucket_tagging_s3: getBucketTagging( input:{
                              Bucket: "${namesOfBuckets[i]}"
                            }
                            ) {
                              ...GetBucketTaggingData
                            }
                            get_bucket_website_s3: getBucketWebsite( input:{
                              Bucket: "${namesOfBuckets[i]}"
                            }
                            ) {
                              ...GetBucketWebsiteData
                            }
                          }
                      }        
                      }            
                        fragment GetBucketLocationData on AwsS3GetBucketLocationOutput{
                          LocationConstraint
                        }  
                        fragment GetBucketTaggingData on AwsS3GetBucketTaggingOutput {
                          TagSet{
                            Key
                            Value
                          }
                        }
                        fragment GetBucketWebsiteData on AwsS3GetBucketWebsiteOutput {
                          RedirectAllRequestsTo {
                            Protocol
                          }
                          IndexDocument {
                            Suffix
                          }
                          ErrorDocument{
                            Key
                          }
                        }
                    `
                  }
                }).then((resultObjFromQuery) => {
                  // The money
                  let currBucketName = namesOfBuckets[i];
                  let regionOfBucket = resultObjFromQuery.data.data.aws.s3.get_region_s3.LocationConstraint;
                  // compiling it all into the data
  
                  if (region === regionOfBucket) {
                    for (let theOnlyVPC in regionState) {
                      if (regionState[theOnlyVPC]['S3']){
                        regionState[theOnlyVPC]['S3'].push(currBucketName);
                      }  
                      else {
                        regionState[theOnlyVPC]['S3'] = [];
                        regionState[theOnlyVPC]['S3'].push(currBucketName);
                      }
                      // logic for S3
                      if(!regionState[theOnlyVPC]['S3Data']) regionState[theOnlyVPC]['S3Data'] = {};
                      const S3Data = regionState[theOnlyVPC]['S3Data'];
                      S3Data[currBucketName] = resultObjFromQuery.data.data.aws.s3;  
                    }
                  }
                  innerResolve();
                  reject();
                })   
              }));
            }
            Promise.all(inPromiseArr).then(() => {
              mainResolve();
            })
          }).catch((err) => console.log('error: ', err))
      }));

      //get Lambda data in a specific region
      function getLambdas(){ return new Promise((resolve, reject)=>{
        let lambda = new AWS.Lambda();
        lambda.listFunctions(function(err, data){
          if(err) reject(err);
          else{
            for(let i = 0; i < data.Functions.length; i++){
              for(let key in regionState){
                if(!regionState[key]['Lambda'])regionState[key]['Lambda'] = {};
                regionState[key]['Lambda'][data.Functions[i].FunctionName] = data.Functions[i]
              }
            }
            resolve();
          }
        })
      })}

    // once all the promise's are resolved, dispatch the data to the reducer
    Promise.all(apiPromiseArray)
    .then(()=>{
      getLambdas()
      .then((values) => {
        const edgeTable = {};
        for (let i = 0; i < sgRelationships.length; i++) {
          sgNodeCorrelations[sgRelationships[i][0]].forEach((val1, val2, set) => {
            sgNodeCorrelations[sgRelationships[i][1]].forEach((value1, value2, set2) => {
              if (!edgeTable.hasOwnProperty(val1)) edgeTable[val1] = new Set();
              edgeTable[val1].add(value1);
            });
          });
        }
        //
        dispatch({
          type: actionTypes.GET_AWS_INSTANCES,
          payload: {
            regionState,
            currentRegion: region,
            edgeTable,
            // sgNodeCorrelations: sgNodeCorrelations,
            // sgRelationships: sgRelationships
          },
        });
        dispatch(getAWSInstancesFinished());
      });
    })
  };
};

// takes in an ID from cyto and dispatches the active id to the reducer to save in state
export const getNodeDetails = data => ({
  type: actionTypes.NODE_DETAILS,
  payload: data,
});



export const getAllRegions = (publicKey, privateKey) => {
  return (dispatch) => {
    dispatch(getAWSInstancesStart());
    axios({
      method: 'post',
      url: 'https://graphql-compose.herokuapp.com/aws/',
      data: {
        query: `
        query {
          aws(config: {
            accessKeyId: "${publicKey}",
            secretAccessKey: "${privateKey}"
          }) {
            ec2{
              us_east_2_ec2: describeInstances(config:{
                region: "us-east-2"
              }) {
                ...DescribeInstanceData
              }
              us_east_1_ec2:  describeInstances(config:{
                region: "us-east-1"
              }) {
                ...DescribeInstanceData
              } 
              us_west_1_ec2:  describeInstances(config:{
                region: "us-west-1"
              }) {
                ...DescribeInstanceData
              }
              us_west_2_ec2:  describeInstances(config:{
                region: "us-west-2"
              }) {
                ...DescribeInstanceData
              }
              ap_south_1_ec2:  describeInstances(config:{
                region: "ap-south-1"
              }) {
                ...DescribeInstanceData
              }
              ap_northeast_2_ec2:  describeInstances(config:{
                region: "ap-northeast-2"
              }) {
                ...DescribeInstanceData
              }
              ap_southeast_1_ec2:  describeInstances(config:{
                region: "ap-southeast-1"
              }) {
                ...DescribeInstanceData
              }
              ap_southeast_2_ec2:  describeInstances(config:{
                region: "ap-southeast-2"
              }) {
                ...DescribeInstanceData
              }
              ap_northeast_1_ec2:  describeInstances(config:{
                region: "ap-northeast-1"
              }) {
                ...DescribeInstanceData
              }
              ca_central_1_ec2:  describeInstances(config:{
                region: "ca-central-1"
              }) {
                ...DescribeInstanceData
              }
              eu_central_1_ec2:  describeInstances(config:{
                region: "eu-central-1"
              }) {
                ...DescribeInstanceData
              }
              eu_west_1_ec2:  describeInstances(config:{
                region: "eu-west-1"
              }) {
                ...DescribeInstanceData
              }
              eu_west_2_ec2:  describeInstances(config:{
                region: "eu-west-2"
              }) {
                ...DescribeInstanceData
              }
              eu_west_3_ec2: describeInstances(config:{
                region: "eu-west-3"
              }) {
                ...DescribeInstanceData
              }
              eu_north_1_ec2:  describeInstances(config:{
                region: "eu-north-1"
              }) {
                ...DescribeInstanceData
              }
              sa_east_1_ec2:  describeInstances(config:{
                region: "sa-east-1"
              }) {
                ...DescribeInstanceData
              }
            }
            rds {
                us_east_2_rds: describeDBInstances(config:{
                  region: "us-east-2"
                }) {
                  ...DbInstanceData
                }
                us_east_1_rds: describeDBInstances(config:{
                  region: "us-east-1"
                }) {
                  ...DbInstanceData                  
                }
                us_west_1_rds: describeDBInstances(config:{
                  region: "us-west-1"
                }) {
                  ...DbInstanceData
                }
                us_west_2_rds: describeDBInstances(config:{
                  region: "us-west-2"
                }) {
                 ...DbInstanceData
                }
                ap_south_1_rds: describeDBInstances(config:{
                  region: "ap-south-1"
                }) {
                 ...DbInstanceData
                }
                ap_northeast_2_rds: describeDBInstances(config:{
                  region: "ap-northeast-2"
                }) {
                 ...DbInstanceData
                }
                ap_southeast_1_rds: describeDBInstances(config:{
                  region: "ap-southeast-1"
                }) {
                  ...DbInstanceData
                }
                ap_southeast_2_rds: describeDBInstances(config:{
                  region: "ap-southeast-2"
                }) {
                 ...DbInstanceData
                }
                ap_northeast_1_rds: describeDBInstances(config:{
                  region: "ap-northeast-1"
                }) {
                 ...DbInstanceData
                }
                ca_central_1_rds: describeDBInstances(config:{
                  region: "ca-central-1"
                }) {
                 ...DbInstanceData
                }
                eu_central_1_rds: describeDBInstances(config:{
                  region: "eu-central-1"
                }) {
               ...DbInstanceData
                }
                eu_west_1_rds: describeDBInstances(config:{
                  region: "eu-west-1"
                }) {
                  ...DbInstanceData
                }
                eu_west_2_rds: describeDBInstances(config:{
                  region: "eu-west-2"
                }) {
                 ...DbInstanceData
                }
                eu_west_3_rds: describeDBInstances(config:{
                  region: "eu-west-3"
                }) {
                ...DbInstanceData
                }
                eu_north_1_rds: describeDBInstances(config:{
                  region: "eu-north-1"
                }) {
                ...DbInstanceData
                }
                sa_east_1_rds: describeDBInstances(config:{
                  region: "sa-east-1"
                }) {
                ...DbInstanceData
                }
              }

            s3  {
                bucketlist_s3 : listBuckets{
                  ...GetBucketLocationData
                }
            }
            lambda {
              us_west_1_lambda: listFunctions(config:{region: "us-west-1"}){
                ...listallfunctions
              }
              us_west_2_lambda: listFunctions(config:{region: "us-west-2"}){
                ...listallfunctions
              }
              us_east_1_lambda: listFunctions(config:{region: "us-east-1"}){
                ...listallfunctions
              }
              us_east_2_lambda: listFunctions(config:{region: "us-east-2"}){
                ...listallfunctions
              }
              ap_south_1_lambda: listFunctions(config:{region: "ap-south-1"}){
                ...listallfunctions
              }
              ap_northeast_1_lambda: listFunctions(config:{region: "ap-northeast-1"}){
                ...listallfunctions
              }
              ap_northeast_2_lambda: listFunctions(config:{region: "ap-northeast-2"}){
                ...listallfunctions
              }
              ap_southeast_1_lambda: listFunctions(config:{region: "ap-southeast-1"}){
                ...listallfunctions
              }
              ap_southeast_2_lambda: listFunctions(config:{region: "ap-southeast-2"}){
                ...listallfunctions
              }
              ca_central_1_lambda: listFunctions(config:{region: "ca-central-1"}){
                ...listallfunctions
              }
              eu_central_1_lambda: listFunctions(config:{region: "eu-central-1"}){
                ...listallfunctions
              }
              eu_west_1_lambda: listFunctions(config:{region: "eu-west-1"}){
                ...listallfunctions
              }
              eu_west_2_lambda: listFunctions(config:{region: "eu-west-2"}){
                ...listallfunctions
              }
              eu_west_3_lambda: listFunctions(config:{region: "eu-west-3"}){
                ...listallfunctions
              }
              eu_north_1_lambda: listFunctions(config:{region: "eu-north-1"}){
                ...listallfunctions
              }
              sa_east_1_lambda: listFunctions(config:{region: "sa-east-1"}){
                ...listallfunctions
              }
            }
          } 
        }    
             
            fragment DescribeInstanceData on AwsEC2DescribeInstancesOutput {
              Reservations {
                Instances {
                  VpcId
                  Placement {
                    AvailabilityZone
                  }
                  State {
                    Name
                  }
                  InstanceId
                  SecurityGroups {
                    GroupId
                  }
                }
              }            
            }  
            
            
            fragment DbInstanceData on AwsRDSDescribeDBInstancesOutput {
              DBInstances {
                DBSubnetGroup{
                  VpcId
                }
                AvailabilityZone
                DbiResourceId
                VpcSecurityGroups {
                  Status
                  VpcSecurityGroupId
                }
                DBInstanceStatus
              }
            }


            fragment GetBucketLocationData on AwsS3ListBucketsOutput{
        			Buckets{
                Name
                CreationDate
              }
            } 
            
            fragment listallfunctions on AwsLambdaListFunctionsOutput{
              Functions {
                FunctionName
                FunctionArn
                Role
                CodeSize
                Description
                Timeout
                MemorySize
                LastModified
                Version
                VpcConfig {
                  VpcId
                  SubnetIds
                  SecurityGroupIds
                }
                TracingConfig{
                  Mode
                }
              }
         }
          
        
        `,
      },
    }).then((result) => {
      const aws = result.data.data.aws;
      let graphData = new compileGraphData();
      let allRegionsPromisesArray = []
      // split the objects into two new constants
      // this is great because we can essentially expand on the many different this that we can model using the cyto library
      const awsEC2 = aws.ec2;
      const awsRDS = aws.rds;
      const awsS3 = aws.s3;
      const lambda = aws.lambda;
      // recreated this with two for loops, since we have two new objects

      // EC2
      for (let regions in awsEC2) {
        const regionArray = regions.split("_")
        const regionString = regionArray[0] + "-" + regionArray[1] + "-" + regionArray[2];
        // inside this Promise maker, changed the obj(awsEC2), and removed the method it's looking for (.describeInstances)
        // this is because I restructored the object we received, you don't need to look for the describeInstance, awsECs[regions] is the describeInstance
        allRegionsPromisesArray.push(new Promise((resolve, reject) => {
          graphData.compileEC2Data(awsEC2[regions], regionString)
          .then(() => resolve());
        }));
      }

      // RDS
      for (let regions in awsRDS) {
        const regionArray = regions.split("_")
        const regionString = regionArray[0] + "-" + regionArray[1] + "-" + regionArray[2];

        // ********ditto from line 441 
        allRegionsPromisesArray.push(new Promise((resolve, reject) => {
          graphData.compileRDSData(awsRDS[regions], regionString)
          .then(() => resolve());
        }));
      }

      // S3
      const bucketlistArr = awsS3.bucketlist_s3.Buckets;
      const bucketNameArr = [];


      bucketlistArr.forEach((bucketObj) => {
        bucketNameArr.push(bucketObj['Name']);
      })

      /*
      create a promise array that pushes all bucket region queries for length of bucketname array
      going to Promise.all at getBucketRegion and use .then and wrap the allRegionsPromiseArray 
      */
      const getBucketRegion = [];
      for (let i = 0; i < bucketNameArr.length; i += 1) {
        getBucketRegion.push(new Promise((resolve, reject) => {
          // bucket region queries
          axios({
            method: 'post',
            url: 'https://graphql-compose.herokuapp.com/aws/',
            data: {
              query: `
              query {
                aws(config: {
                  accessKeyId: "${publicKey}",
                  secretAccessKey: "${privateKey}"
                }) {
                s3 {
                      get_region_s3 : getBucketLocation( input:{
                        Bucket: "${bucketNameArr[i]}"
                      }
                      ) {
                        ...GetBucketLocationData
                      }
                      get_bucket_tagging_s3: getBucketTagging( input:{
                        Bucket: "${bucketNameArr[i]}"
                      }
                      ) {
                        ...GetBucketTaggingData
                      }
                      get_bucket_website_s3: getBucketWebsite( input:{
                        Bucket: "${bucketNameArr[i]}"
                      }
                      ) {
                        ...GetBucketWebsiteData
                      }
                    }
                }        
                }            
                  fragment GetBucketLocationData on AwsS3GetBucketLocationOutput{
                    LocationConstraint
                  }  
                  fragment GetBucketTaggingData on AwsS3GetBucketTaggingOutput {
                    TagSet{
                      Key
                      Value
                    }
                  }
                  fragment GetBucketWebsiteData on AwsS3GetBucketWebsiteOutput {
                    RedirectAllRequestsTo {
                      Protocol
                    }
                    IndexDocument {
                      Suffix
                    }
                    ErrorDocument{
                      Key
                    }
                  }
              `
            }
          }).then((resultObjFromQuery) => {
            // reconstruct new Object from resultObject, should only have two keys, the Name and region 
            // from that, figure out how the cytoscape icons are rendered and call on those functions to render
            // this is when we resolve and then get it called on Promise.all( getBucketRegion )
            // see if that works alone, else wrap the rest of the the promise all function line ~562 inside of the then of the PromiseAll ( getBucketRegion )
            
            /*
            allS3Objects = {
              <region name> : [{<bucket name>: {}}];
            }
            */
            let regionOfBucket = resultObjFromQuery.data.data.aws.s3.get_region_s3.LocationConstraint;
            let currS3DataObject = resultObjFromQuery.data.data.aws.s3
            let currBucketName = bucketNameArr[i];
            // compiling it all into the data
            graphData.compileS3Data(currBucketName, regionOfBucket, currS3DataObject );
            resolve();
          })
        
        }));
      }

      // lambda
      for (let regions in lambda) {
        const regionArray = regions.split("_")
        const regionString = regionArray[0] + "-" + regionArray[1] + "-" + regionArray[2];
        allRegionsPromisesArray.push(new Promise((resolve, reject) => {
          graphData.compileLambdaData(lambda[regions], regionString)
          .then(() => resolve())
          .catch((err)=> reject(err));
        }));
      }     
        

      Promise.all(getBucketRegion).then(() => {
        Promise.all(allRegionsPromisesArray).then(() => {
          graphData.createEdges();
          const edgeTable = graphData.getEdgesData();
          
          const regionState = graphData.getRegionData();
          dispatch(getAWSInstancesFinished());
          dispatch({
            type: actionTypes.GET_AWS_INSTANCES,
            payload: {
              regionState,
              edgeTable,
              currentRegion: 'all',
            },
          });
        });
      });
      // end of promise
    });
  };
};
