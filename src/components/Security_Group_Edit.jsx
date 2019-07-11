import React, { Component } from 'react';

const AWS = require('aws-sdk');

class Security_Group_Edit extends Component{

  constructor(props){
    super(props)
    this.state = {
      index : 0,
      inbound: false,
      outbound: false,
      sgDataArray:[]
    }
    this.handleChange = this.handleChange.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    // this.handleInOut = this.handleInOut.bind(this);
    this.getSgTotal = this.getSgTotal.bind(this);
    this.checkSource = this.checkSource.bind(this);

  }

  getSgTotal(){
    console.log(this.props.sgData);
    const {sgData} = this.props;
    const groupIds = [];
    for(let i = 0; i < sgData.length; i++){
      groupIds.push(<input id="GroupId" defaultValue={sgData[i].GroupId} ref={(input) => this.GroupId = input}/>);
    }
    return groupIds;
  }

  handleChange(event) {
    this.setState({
      index: event.target.value
    });
  }
  // handleInOut(event) {
  //   this.getSgTotal();
  //   if(event.target.value === 'inbound' && this.state.inbound === false){
  //     this.setState({
  //       inbound: true,
  //       outbound: false
  //     })
  //   }
  //   if(event.target.value === 'outbound' && this.state.outbound === false){
  //     this.setState({
  //       inbound: false,
  //       outbound: true
  //     })
  //   }
  // }

  checkSource(input){
    const cidrRegex = "^([0-9]{1,3}\.){3}[0-9]{1,3}(\/([0-9]|[1-2][0-9]|3[0-2]))?$";
    if(input.match(cidrRegex)) return true;
  }

  handleSubmit(event){
    let ranges;
    let toPort;
    if(this.portRange.value == 'all' || this.portRange.value === 'All'){
      ranges = [0];
      toPort = 65535;
    } else {
      ranges = this.portRange.value.split("-");
      toPort = ranges.length > 1 ? ranges[1]:ranges[0];
    } 
    // async call to do get the api, then refresh
    console.log("type of ", typeof this.source.value)
    const ec2 = new AWS.EC2();
    const paramsIn = {
      GroupId: this.GroupId.value, //selected node
      IpPermissions: [
         {
        FromPort: ranges[0], 
        IpProtocol: this.protocol.value, 
        ToPort: toPort
       }
      ]
     };
     const paramsOut = {
      GroupId: this.source.value, //inputted source
      IpPermissions: [
         {
        FromPort: ranges[0], 
        IpProtocol: this.protocol.value, 
        ToPort: toPort
       }
      ]
     };
     if(this.checkSource(this.source.value)){
       //need to check this case of a IP!!!!!!! or anywhere, still not ready
       //checks if it is an IP address, saves it to CidrIp
       paramsIn.IpPermissions[0].IpRanges = [{CidrIp:this.source.value, Description:this.description.value}]
       paramsOut.IpPermissions[0].IpRanges = [{CidrIp:this.GroupId.value, Description:this.description.value}]

     }
     else{
       //if not IP then it is a security group id (sg-fdgriwerhcwke)
        paramsIn.IpPermissions[0].UserIdGroupPairs = [{GroupId:this.source.value, Description:this.description.value}]
        paramsOut.IpPermissions[0].UserIdGroupPairs = [{GroupId:this.GroupId.value, Description:this.description.value}]
     }
    function editSGPromisesIn() { return new Promise((resolve,reject) => {
        ec2.authorizeSecurityGroupIngress(paramsIn, function(err, data) {
          if (err){
            console.log('Data not inputted in correct format', err, err.stack); // an error occurred
            reject(err);
          }
          resolve(); 
        });
      });
    };
    function editSGPromisesOut(){
      return new Promise((resolve, reject)=>{
        ec2.authorizeSecurityGroupEgress(paramsOut, function(err, data) {
          if (err){
            console.log('Data not inputted in correct format', err, err.stack); // an error occurred
            reject(err);
          }
          resolve(); 
         });
      });
    };   

     editSGPromisesIn()
     .then(()=>{editSGPromisesOut()})
     .then( (result) => {
      this.props.onRequestClose()
      console.log('Got the result: ' + result);
    })
    .catch(function(err) {
      alert(err);
    });

    //  .then(this.props.onRequestClose() , reason => {
    //    alert(reason);
    //  });
    event.preventDefault();
  }

  render(){
  const AutofillData = [
    {
      type: 'Custom TCP Rule',
      Protocol: 'TCP',
      PortRange: ''
    },{
      type: 'Custom UDP Rule',
      Protocol: 'UDP',
      PortRange: ''
    },{
      type: 'Custom ICMP Rule - IPv4',
      Protocol: [],
      PortRange: 'N/A'
    },{
      type: 'Custom ICMP Rule - IPv6',
      Protocol: 'IPV6 ICMP',
      PortRange: 'All'
    },{
      type: 'Custom Protocol',
      Protocol: '',
      PortRange: 'all'
    },{
      type: 'All TCP',
      Protocol: 'TCP',
      PortRange: '0-65535'
    },{
      type: 'All UDP',
      Protocol: 'UDP',
      PortRange: '0-65535'
    },{
      type: 'All ICMP - IPv4',
      Protocol: 'ICMP',
      PortRange: '0-65535'
    },{
      type: 'All ICMP - IPv6',
      Protocol: 'IPV6 ICMP',
      PortRange: 'All'
    },{
      type: 'All traffic',
      Protocol: 'All',
      PortRange: '0-65535'
    },{
      type: 'SSH',
      Protocol: 'TCP',
      PortRange: '22'
    },{
      type: 'SMTP',
      Protocol: 'TCP',
      PortRange: '25'
    },{
      type: 'DNS (UDP)',
      Protocol: 'UDP',
      PortRange: '53'
    },{
      type: 'DNS (TCP)',
      Protocol: 'TCP',
      PortRange: '53'
    },{
      type: 'HTTP',
      Protocol: 'TCP',
      PortRange: '80'
    },{
      type: 'POP3',
      Protocol: 'TCP',
      PortRange: '110'
    },
    {
      type: 'IMAP',
      Protocol: 'TCP',
      PortRange: '143'
    },
    {
      type: 'LDAP',
      Protocol: 'TCP',
      PortRange: '389'
    },
    {
      type: 'HTTPS',
      Protocol: 'TCP',
      PortRange: '443'
    },
    {
      type: 'SMB',
      Protocol: 'TCP',
      PortRange: '445'
    },
    {
      type: 'SMTPS',
      Protocol: 'TCP',
      PortRange: '465'
    },
    {
      type: 'IMAPS',
      Protocol: 'TCP',
      PortRange: '993'
    },
    {
      type: 'POP3S',
      Protocol: 'TCP',
      PortRange: '995'
    },
    {
      type: 'MS SQL',
      Protocol: 'TCP',
      PortRange: '1433'
    },
    {
      type: 'NFS',
      Protocol: 'TCP',
      PortRange: '2049'
    },
    {
      type: 'MYSQL/Aurora',
      Protocol: 'TCP',
      PortRange: '3306'
    },
    {
      type: 'RDP',
      Protocol: 'TCP',
      PortRange: '3389'
    },
    {
      type: 'Redshift',
      Protocol: 'TCP',
      PortRange: '5439'
    },
    {
      type: 'PostgreSQL',
      Protocol: 'TCP',
      PortRange: '5432'
    },
    {
      type: 'Oracle-RDS',
      Protocol: 'TCP',
      PortRange: '1521'
    },
    {
      type: 'WinRM-HTTP',
      Protocol: 'TCP',
      PortRange: '5985'
    },
    {
      type: 'WinRM-HTTPS',
      Protocol: 'TCP',
      PortRange: '5986'
    },
    {
      type: 'Elastic Graphics',
      Protocol: 'TCP',
      PortRange: '2007'
    }
  ]

  const AutoFillArray = [];
  for( let i = 0; i < AutofillData.length; i +=1 ){
    AutoFillArray.push(<option id="type" ref={(input) => this.type = input} value={i}>{AutofillData[i].type} </option>)
  }


  return (
    <div id='modal-table'>
    <form onSubmit={this.handleSubmit}>
      <h2> Edit Inbound and Outbound Security Groups</h2>
      <table>
        <tr>
          <th>Inbound: </th>
          <th></th>
          <th></th>
          <th>Outbound: </th>
        </tr>
        <tr>
          <th>
          {/* <input id="Source" type="text" defaultValue={this.getSgTotal()} ref={(input) => this.selectInbound = input} /> */}
              {this.getSgTotal()}
          </th>
          <th><h2>{'\<-----'}</h2></th>
          <th></th>
          <th> 
              <input id="Source" type="text" ref={(input) => this.source = input} />
              <select> 
              <option value="Custom">Custom</option>
              <option value="Anywhere">Anywhere</option>
              <option value="My IP">My IP</option>
              </select>
          </th>
        </tr>
      </table>
      <table>
        <tr>
          <th>Type</th>
          <th>Protocol</th>
          <th>Port Range</th>
          <th>Description</th>
        </tr>
        <tr>
          <th>
            <select onChange={this.handleChange}>
             {AutoFillArray}
            </select>
          </th>
          <th> <input id="protocol" type="text" value={AutofillData[this.state.index].Protocol} ref={(input) => this.protocol = input}/></th>
          <th> <input id="portRange" type="text" defaultValue={AutofillData[this.state.index].PortRange} ref={(input) => this.portRange = input}/></th>
          <th> <input id="Description" type="text" ref={(input) => this.description = input} /></th>
        </tr>
      </table>
      <input type="submit" value="Submit" />
    </form>
    </div>
    )
  }
}



export default Security_Group_Edit;