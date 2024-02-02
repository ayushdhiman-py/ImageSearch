import React, {useState, useEffect, useRef, useMemo, useCallback} from 'react';
import {
  View,
  FlatList,
  Image,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Text,
  Modal,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {CameraRoll} from '@react-native-camera-roll/camera-roll';
import RNTextDetector from 'rn-text-detector';
import FastImage from 'react-native-fast-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {unstable_batchedUpdates} from 'react-native';

const App = () => {
  const generateStorageKey = uri => `img_${uri.replace(/\W/g, '_')}`;
  const getUriFromStorageKey = key =>
    key.startsWith('img_') ? key.slice(4).replace(/_/g, '/') : key;

  const requestPhotoPermission = async () => {
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        {
          title: 'Photo Access Permission',
          message: 'We need access to your photos for the OCR functionality.',
          buttonNeutral: 'Ask Me Later',
          buttonNegative: 'Cancel',
          buttonPositive: 'OK',
        },
      );

      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        console.warn('Permission for accessing photos was denied');
        setIsLoading(false);
        return;
      }
    }

    fetchPhotos();
  };

  const trieUpdatedRef = useRef(false);
  const runSearch = () => {
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm) {
      let results = trie.searchWithPrefix(trimmedTerm.toLowerCase());
      setSearchResults(results); // Directly update the search results.
    }
  };

  useEffect(() => {
    runSearch();
    setNeedsResearch(false);
  }, [searchTerm, needsResearch]);

  useEffect(() => {
    const initializeApp = async () => {
      await AsyncStorage.setItem('test', 'This is a test value.');
      const testValue = await AsyncStorage.getItem('test');

      await requestPhotoPermission();
      await loadStoredPhotos();
      fetchPhotos();
    };

    initializeApp();
  }, []);

  class TrieNode {
    constructor() {
      this.children = {};
      this.isEndOfWord = false;
      this.data = new Set(); // Changed this to a Set
    }
  }

  class Trie {
    constructor() {
      this.root = new TrieNode();
    }

    // Inserts a word into the trie and associates it with the image URI
    insert(phrase, imageUri) {
      const words = phrase.split(' ');
      words.forEach(word => {
        let currentNode = this.root;
        for (let i = 0; i < word.length; i++) {
          let ch = word.charAt(i);
          if (!currentNode.children[ch]) {
            currentNode.children[ch] = new TrieNode();
          }
          currentNode = currentNode.children[ch];
        }
        currentNode.isEndOfWord = true;
        currentNode.data.add(imageUri); // Directly add the URI. Set will ensure its uniqueness.
      });
    }

    // Returns all image URIs that have the given prefix
    searchWithPrefix(prefix) {
      let currentNode = this.root;

      // Navigate to the node corresponding to the last character of the prefix
      for (let i = 0; i < prefix.length; i++) {
        let ch = prefix.charAt(i);
        if (!currentNode.children[ch]) return [];
        currentNode = currentNode.children[ch];
      }

      const gatherData = (node, arr) => {
        if (node.data.size > 0) {
          node.data.forEach(imageUri => {
            if (!arr.includes(imageUri)) {
              arr.push(imageUri);
            }
          });
        }
        for (let child in node.children) {
          gatherData(node.children[child], arr);
        }
      };

      let results = [];
      gatherData(currentNode, results);
      return results;
    }
  }

  const [photos, setPhotos] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ocrData, setOcrData] = useState({});
  const [isModalOpen, setModalOpen] = useState(false);
  const [currentImage, setCurrentImage] = useState(null);
  const [isOldestFirst, setIsOldestFirst] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const trie = useMemo(() => new Trie(), []);
  const [isLoading, setIsLoading] = useState(true);
  const [failedImages, setFailedImages] = useState(new Set());
  const [needsResearch, setNeedsResearch] = useState(false);

  useEffect(() => {
    fetchPhotos();
  }, [isOldestFirst]);

  useEffect(() => {
    const trimmedTerm = searchTerm.trim();
    if (trimmedTerm) {
      let results = trie.searchWithPrefix(trimmedTerm.toLowerCase());
      setSearchResults(results);
    } else {
      setSearchResults([]);
    }

    // This part checks if Trie was updated during a search
    if (trieUpdatedRef.current) {
      const trimmedTerm = searchTerm.trim();
      if (trimmedTerm) {
        let results = trie.searchWithPrefix(trimmedTerm.toLowerCase());
        setSearchResults(results);
        trieUpdatedRef.current = false; // Reset the flag
      }
    }
  }, [searchTerm]);

  const handlePhotoWithExistingData = (uri, parsedData) => {
    // Update OCR data state
    let actualOcrData = parsedData.ocrData;

    if (!actualOcrData) {
      if (Array.isArray(parsedData)) {
        actualOcrData = parsedData;
      } else {
        console.error('Unexpected parsedData structure:', parsedData);
        return;
      }
    }

    if (!Array.isArray(actualOcrData)) {
      console.error(
        'Expected parsedData.ocrData to be an array, but got:',
        parsedData,
      );
      return;
    }
    unstable_batchedUpdates(() => {
      setOcrData(prevData => ({...prevData, [uri]: actualOcrData}));

      // Populate Trie
      actualOcrData.forEach(textBlock => {
        const words = textBlock.text.toLowerCase().split(/\s+/);
        words.forEach(word => {
          trie.insert(word, uri);
          setNeedsResearch(true);
        });
      });

      // Update photos state
      setPhotos(prevPhotos => {
        if (!prevPhotos.some(photo => photo.node.image.uri === uri)) {
          return [...prevPhotos, {node: {image: {uri}}}];
        }
        return prevPhotos;
      });
    });
  };

  const loadStoredPhotos = async () => {
    const storedKeys = await AsyncStorage.getAllKeys();
    const storedPhotoUris = storedKeys
      .map(getUriFromStorageKey)
      .filter(uri => uri !== 'test'); // Filtering out 'test'

    for (const uri of storedPhotoUris) {
      try {
        const savedOcrData = await AsyncStorage.getItem(
          generateStorageKey(uri),
        );
        if (savedOcrData) {
          try {
            const parsedData = JSON.parse(savedOcrData);
            handlePhotoWithExistingData(uri, parsedData);
          } catch (error) {
            console.error('Error parsing JSON:', error);
          }
        }
      } catch (err) {}
    }
    setIsLoading(false);
  };
  const imageContainsTerm = (textRecognition, term) => {
    const searchText = term.trim().toLowerCase();
    for (const textBlock of textRecognition) {
      if (textBlock.text.toLowerCase().includes(searchText)) {
        return true;
      }
    }
    return false;
  };

  const handleNewPhoto = async uri => {
    const textRecognition = await RNTextDetector.detectFromUri(uri);

    if (textRecognition && textRecognition.length > 0) {
      // Update OCR data
      setOcrData(prevData => {
        const newData = {...prevData, [uri]: textRecognition};
        return newData;
      });

      // Add recognized text to trie
      textRecognition.forEach(textBlock => {
        const words = textBlock.text.toLowerCase().split(/\s+/);
        words.forEach(word => {
          trie.insert(word, uri);
        });
      });

      try {
        const imageData = {
          uri,
          ocrData: textRecognition,
        };
        await AsyncStorage.setItem(
          generateStorageKey(uri),
          JSON.stringify(imageData),
        );
      } catch (error) {
        console.error('Error saving to AsyncStorage:', error);
      }
      return true;
    }
    return false;
  };

  const fetchPhotos = async () => {
    try {
      const result = await CameraRoll.getPhotos({
        first: 500, // or however many you want
        assetType: 'Photos',
      });
      setPhotos(result.edges);

      const currentPhotoUris = new Set(
        result.edges.map(photo => photo.node.image.uri),
      );
      const allKeys = await AsyncStorage.getAllKeys();

      // Step 1: Handle photos with existing data
      const existingPhotos = allKeys.filter(key =>
        currentPhotoUris.has(getUriFromStorageKey(key)),
      );

      for (const uri of existingPhotos) {
        try {
          const savedImageData = await AsyncStorage.getItem(
            generateStorageKey(uri),
          );
          if (savedImageData) {
            const imageData = JSON.parse(savedImageData);
            handlePhotoWithExistingData(imageData.uri, imageData);
          }
        } catch (err) {}
      }

      // Step 2: Handle new photos
      const newPhotoUris = [...currentPhotoUris].filter(
        uri => !existingPhotos.includes(uri),
      );

      for (const uri of newPhotoUris) {
        const success = await handleNewPhoto(uri);
        if (success && searchTerm) {
          setNeedsResearch(true);
        }
      }

      // Cleanup: Remove old data from AsyncStorage
      const obsoleteUris = allKeys.filter(
        key => !currentPhotoUris.has(getUriFromStorageKey(key)),
      );

      for (const uri of obsoleteUris) {
        await AsyncStorage.removeItem(uri);
      }

      setIsLoading(false);
    } catch (err) {
      setIsLoading(false);
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
  const [refresh, setRefresh] = useState(false);

  useEffect(() => {
    setRefresh(!refresh);
  }, [searchResults]);

  const renderItem = useCallback(
    ({item}) => {
      const uri = item.node ? item.node.image.uri : item;
      if (failedImages.has(uri)) return null;

      return (
        <TouchableOpacity
          style={styles.imageContainer}
          onPress={() => handlePress(uri)}>
          <FastImage
            style={styles.image}
            source={{uri, priority: FastImage.priority.high}}
            onError={error => {
              setFailedImages(prev => new Set([...prev, uri]));
            }}
          />
        </TouchableOpacity>
      );
    },
    [failedImages],
  );

  const memoizedSearchResults = useMemo(() => searchResults, [searchResults]);

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchBar}
          value={searchTerm}
          onChangeText={text => setSearchTerm(text.trim())}
          placeholder="Search text inside images here..."
        />

        {searchTerm && (
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => setSearchTerm('')}>
            <Text style={styles.clearButtonText}>X</Text>
          </TouchableOpacity>
        )}
      </View>
      {isLoading ? (
        <View style={{justifyContent: 'center'}}>
          <ActivityIndicator
            size="large"
            color="white"
            style={styles.loadingIndicator}
          />
          <Text>
            Extrating text from photos please wait... It might take a while.
          </Text>
        </View>
      ) : (
        <FlatList
          key={searchTerm ? searchResults.length : photos.length}
          data={searchTerm ? memoizedSearchResults : photos}
          extraData={refresh}
          numColumns={4}
          windowSize={21}
          renderItem={renderItem} // Here we use the newly defined function
          keyExtractor={item => (item.node ? item.node.image.uri : item)}
        />
      )}
      <Modal
        visible={isModalOpen}
        transparent={true}
        onRequestClose={closeModal}>
        <TouchableOpacity style={styles.modalContainer} onPress={closeModal}>
          <Image style={styles.modalImage} source={{uri: currentImage}} />
        </TouchableOpacity>
      </Modal>
      {/* <TouchableOpacity onPress={handleFilter} style={styles.filterButton}>
        <Text style={{color: 'black'}}>Reverse result</Text>
      </TouchableOpacity> */}
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
    borderColor: 'white',
    borderWidth: 1,
    borderRadius: 5,
    padding: 5,
    paddingLeft: 10,
    paddingRight: 30,
    color: 'white',
    fontWeight: 'bold',
    height: 50,
    fontSize: 20,
    backgroundColor: 'grey',
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
  imageContainer: {
    flex: 1,
    margin: 2,
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
