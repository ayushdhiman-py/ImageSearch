import React, {useState, useEffect} from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Text,
  Modal,
} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import RNTextDetector from 'rn-text-detector';

const App = () => {
  const [photos, setPhotos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ocrData, setOcrData] = useState({});
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [isOldestFirst, setIsOldestFirst] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [isOldestFirst]);

  const fetchPhotos = () => {
    CameraRoll.getPhotos({
      first: 50,
      assetType: 'Photos',
    })
      .then(r => {
        let sortedPhotos = [...r.edges];
        if (isOldestFirst) {
          sortedPhotos.sort((a, b) => a.node.timestamp - b.node.timestamp);
        } else {
          sortedPhotos.sort((a, b) => b.node.timestamp - a.node.timestamp);
        }

        setPhotos(sortedPhotos);
        sortedPhotos.forEach(photo => {
          getOcrData(photo.node.image.uri);
        });
      })
      .catch(err => console.log(err));
  };

  // const fetchPhotos = () => {
  //   CameraRoll.getPhotos({
  //     first: 50,
  //     assetType: 'Photos',
  //   })
  //     .then(r => {
  //       setPhotos(r.edges);
  //       r.edges.forEach(photo => {
  //         console.log('photo.node.image.uri==>', photo.node.image.uri);
  //         getOcrData(photo.node.image.uri);
  //       });
  //     })
  //     .catch(err => console.log(err));
  // };

  const getOcrData = async uri => {
    try {
      const textRecognition = await RNTextDetector.detectFromUri(uri);
      setOcrData(prevData => ({...prevData, [uri]: textRecognition}));
    } catch (error) {
      console.log('Error on text recognition: ', error);
    }
  };

  const handlePress = uri => {
    setCurrentImage(uri);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setCurrentImage(null);
  };

  const handleFilter = () => {
    setIsOldestFirst(!isOldestFirst);
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          value={searchTerm}
          onChangeText={setSearchTerm}
          placeholder="Search..."
        />
        {searchTerm ? (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchTerm('')}>
            <Text style={styles.clearButtonText}>X</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={photos}
        numColumns={3}
        renderItem={({item}) => {
          const text = ocrData[item.node.image.uri]
            ?.map(block => block.text.toLowerCase())
            .join(', ');

          if (searchTerm && text && !text.includes(searchTerm.toLowerCase())) {
            return null;
          }

          return (
            <View style={{flex: 1, flexWrap: 'wrap'}}>
              <TouchableOpacity
                style={{
                  width: 140,
                  overflow: 'hidden',
                  justifyContent: 'space-evenly',
                }}
                onPress={() => handlePress(item.node.image.uri)}>
                <View style={styles.card}>
                  <Image
                    style={styles.image}
                    source={{uri: item.node.image.uri}}
                  />
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
        keyExtractor={item => item.node.image.uri}
      />
      <Modal
        visible={isModalOpen}
        transparent={true}
        onRequestClose={closeModal}>
        <TouchableOpacity style={styles.modalContainer} onPress={closeModal}>
          <Image style={styles.modalImage} source={{uri: currentImage}} />
        </TouchableOpacity>
      </Modal>
      <TouchableOpacity onPress={handleFilter} style={styles.filterButton}>
        <Text style={{color: 'black'}}>Reverse result</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'black',
  },
  searchContainer: {
    flexDirection: 'row',
    margin: 10,
    alignItems: 'center',
  },
  searchBar: {
    flex: 1,
    borderColor: 'grey',
    borderWidth: 1,
    borderRadius: 5,
    padding: 5,
    paddingLeft: 10,
    paddingRight: 30,
    color: 'white',
    fontWeight: 'bold',
    height: 50,
    fontSize: 20,
  },
  clearButton: {
    position: 'absolute',
    right: 10,
    height: '100%',
    justifyContent: 'center',
    padding: 5,
  },
  clearButtonText: {
    fontSize: 18,
    color: 'white',
  },
  card: {
    flex: 1,
    flexDirection: 'column',
  },
  image: {
    width: '100%',
    aspectRatio: 0.8,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalImage: {
    width: '90%',
    height: '70%',
    resizeMode: 'contain',
    backgroundColor: 'white',
  },
  filterButton: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    padding: 10,
    backgroundColor: 'white',
    borderRadius: 50,
  },
  filterIcon: {
    width: 30,
    height: 30,
  },
});
export default App;
